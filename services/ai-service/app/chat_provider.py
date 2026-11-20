"""Bounded Anthropic Messages API adapter for the public chat endpoint."""

from __future__ import annotations

import unicodedata
from collections.abc import Sequence
from dataclasses import dataclass
from time import monotonic
from typing import Any, Protocol, TypeAlias

import httpx
from anthropic import (
    Anthropic,
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    DefaultHttpxClient,
)

from app.chat_prompt import (
    SYSTEM_PROMPT,
    SYSTEM_PROMPT_WITH_RECOMMENDATIONS,
    provider_messages,
)
from app.chat_store import ChatTurn

MAXIMUM_ANSWER_CHARACTERS = 8_000
MAXIMUM_ANSWER_BYTES = 32 * 1024
MAXIMUM_TOOL_ID_BYTES = 256
MY_JOB_RECOMMENDATION_TOOL_NAME = "get_my_job_recommendations"

MY_JOB_RECOMMENDATION_TOOL: dict[str, Any] = {
    "name": MY_JOB_RECOMMENDATION_TOOL_NAME,
    "description": (
        "Fetch current job suggestions or listings for the authenticated Candidate. "
        "Use whenever the Candidate asks to view, open, find, or get job recommendations "
        "(e.g., 'gợi ý việc làm', 'mở cho tôi những job', 'tìm việc', 'có job nào', 'tìm việc làm'). "
        "Identity, CV, and preferences are resolved by the server."
    ),
    "strict": True,
    "input_schema": {
        "type": "object",
        "properties": {},
        "required": [],
        "additionalProperties": False,
    },
}
MY_JOB_RECOMMENDATION_TOOL_CHOICE: dict[str, Any] = {
    "type": "auto",
    "disable_parallel_tool_use": True,
}


class ChatProviderUnavailable(RuntimeError):
    """The provider did not return a safe complete decision."""


@dataclass(frozen=True, slots=True)
class ChatText:
    answer: str


@dataclass(frozen=True, slots=True)
class MyJobRecommendationIntent:
    """A parameter-free intent marker; provider tool identifiers are discarded."""


ChatProviderDecision: TypeAlias = ChatText | MyJobRecommendationIntent


class ChatProvider(Protocol):
    def decide(
        self,
        history: Sequence[ChatTurn],
        current_message: str,
        *,
        recommendation_tool_enabled: bool,
    ) -> ChatProviderDecision: ...


class AnthropicChatProvider:
    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        timeout_seconds: int,
        max_output_tokens: int,
        client: Any | None = None,
    ) -> None:
        self._model = model
        self._max_output_tokens = max_output_tokens
        self._owns_client = client is None
        self._client = client or Anthropic(
            api_key=api_key,
            base_url="https://api.anthropic.com",
            timeout=float(timeout_seconds),
            max_retries=0,
            http_client=DefaultHttpxClient(
                trust_env=False,
                transport=_TotalDeadlineTransport(float(timeout_seconds)),
            ),
        )

    def close(self) -> None:
        if not self._owns_client:
            return
        try:
            self._client.close()
        except Exception:
            # Shutdown cleanup is best effort and must not expose provider details.
            pass

    def decide(
        self,
        history: Sequence[ChatTurn],
        current_message: str,
        *,
        recommendation_tool_enabled: bool,
    ) -> ChatProviderDecision:
        request: dict[str, Any] = {
            "model": self._model,
            "max_tokens": self._max_output_tokens,
            "system": (
                SYSTEM_PROMPT_WITH_RECOMMENDATIONS
                if recommendation_tool_enabled
                else SYSTEM_PROMPT
            ),
            "messages": provider_messages(history, current_message),
        }
        if recommendation_tool_enabled:
            request["tools"] = [MY_JOB_RECOMMENDATION_TOOL]
            request["tool_choice"] = MY_JOB_RECOMMENDATION_TOOL_CHOICE

        try:
            response = self._client.messages.create(**request)
        except (APITimeoutError, APIConnectionError, APIStatusError) as error:
            raise ChatProviderUnavailable("chat provider unavailable") from error
        except Exception as error:
            raise ChatProviderUnavailable("chat provider invalid response") from error

        stop_reason = getattr(response, "stop_reason", None)
        if stop_reason == "end_turn":
            return ChatText(answer=self._answer_text(response))
        if stop_reason == "tool_use" and recommendation_tool_enabled:
            self._validate_single_recommendation_tool_call(response)
            return MyJobRecommendationIntent()
        raise ChatProviderUnavailable("chat provider invalid response")

    @staticmethod
    def _answer_text(response: object) -> str:
        content = getattr(response, "content", None)
        if not isinstance(content, list) or not content:
            raise ChatProviderUnavailable("chat provider invalid response")
        text_parts: list[str] = []
        for block in content:
            text = getattr(block, "text", None)
            if getattr(block, "type", None) != "text" or not isinstance(text, str):
                raise ChatProviderUnavailable("chat provider invalid response")
            text_parts.append(text)
        answer = unicodedata.normalize("NFC", "\n".join(text_parts)).strip()
        if (
            not answer
            or len(answer) > MAXIMUM_ANSWER_CHARACTERS
            or len(answer.encode("utf-8")) > MAXIMUM_ANSWER_BYTES
            or _contains_unsafe_control(answer)
        ):
            raise ChatProviderUnavailable("chat provider invalid response")
        return answer

    @staticmethod
    def _validate_single_recommendation_tool_call(response: object) -> None:
        content = getattr(response, "content", None)
        if not isinstance(content, list) or len(content) != 1:
            raise ChatProviderUnavailable("chat provider invalid response")
        block = content[0]
        if getattr(block, "type", None) != "tool_use":
            raise ChatProviderUnavailable("chat provider invalid response")
        if getattr(block, "name", None) != MY_JOB_RECOMMENDATION_TOOL_NAME:
            raise ChatProviderUnavailable("chat provider invalid response")
        tool_input = getattr(block, "input", None)
        if type(tool_input) is not dict or tool_input:
            raise ChatProviderUnavailable("chat provider invalid response")
        tool_id = getattr(block, "id", None)
        if (
            not isinstance(tool_id, str)
            or not tool_id
            or len(tool_id.encode("utf-8")) > MAXIMUM_TOOL_ID_BYTES
            or any(
                ord(character) < 0x21 or ord(character) > 0x7E for character in tool_id
            )
        ):
            raise ChatProviderUnavailable("chat provider invalid response")


class GeminiChatProvider:
    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        timeout_seconds: int,
        max_output_tokens: int,
        client: httpx.Client | None = None,
    ) -> None:
        self._api_key = api_key
        self._model = model
        self._max_output_tokens = max_output_tokens
        self._timeout_seconds = timeout_seconds
        self._owns_client = client is None
        self._client = client or httpx.Client(
            timeout=float(timeout_seconds),
            transport=_TotalDeadlineTransport(float(timeout_seconds)),
            trust_env=False,
        )

    def close(self) -> None:
        if not self._owns_client:
            return
        try:
            self._client.close()
        except Exception:
            pass

    def decide(
        self,
        history: Sequence[ChatTurn],
        current_message: str,
        *,
        recommendation_tool_enabled: bool,
    ) -> ChatProviderDecision:
        contents: list[dict[str, Any]] = []
        for turn in history:
            contents.append({
                "role": "user",
                "parts": [{"text": turn.user_message}],
            })
            contents.append({
                "role": "model",
                "parts": [{"text": turn.assistant_message}],
            })
        contents.append({
            "role": "user",
            "parts": [{"text": current_message}],
        })

        system_instruction_text = (
            SYSTEM_PROMPT_WITH_RECOMMENDATIONS
            if recommendation_tool_enabled
            else SYSTEM_PROMPT
        )

        payload: dict[str, Any] = {
            "system_instruction": {
                "parts": [{"text": system_instruction_text}]
            },
            "contents": contents,
            "generationConfig": {
                "maxOutputTokens": self._max_output_tokens,
                "temperature": 0.5,
            },
        }

        if recommendation_tool_enabled:
            payload["tools"] = [
                {
                    "function_declarations": [
                        {
                            "name": MY_JOB_RECOMMENDATION_TOOL_NAME,
                            "description": (
                                "Fetch current job suggestions or listings for the authenticated Candidate. "
                                "Call this tool whenever the Candidate asks for job recommendations, finding jobs, "
                                "opening jobs, or viewing available jobs (e.g. 'gợi ý việc làm', 'mở cho tôi những job', "
                                "'tìm việc', 'có việc nào không', 'job về...')."
                            ),
                            "parameters": {
                                "type": "OBJECT",
                                "properties": {},
                            },
                        }
                    ]
                }
            ]

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self._model}:generateContent?key={self._api_key}"

        try:
            response = self._client.post(
                url,
                json=payload,
                headers={"Content-Type": "application/json"},
            )
        except (httpx.TimeoutException, httpx.RequestError) as error:
            raise ChatProviderUnavailable("gemini provider network error") from error
        except Exception as error:
            raise ChatProviderUnavailable("gemini provider request failed") from error

        if response.status_code != 200:
            raise ChatProviderUnavailable(f"gemini provider error HTTP {response.status_code}")

        try:
            data = response.json()
        except Exception as error:
            raise ChatProviderUnavailable("gemini provider returned non-json") from error

        candidates = data.get("candidates")
        if not isinstance(candidates, list) or not candidates:
            raise ChatProviderUnavailable("gemini provider returned no candidates")

        candidate = candidates[0]
        content = candidate.get("content", {})
        parts = content.get("parts", [])
        if not isinstance(parts, list) or not parts:
            raise ChatProviderUnavailable("gemini provider returned empty parts")

        # Check for function call
        if recommendation_tool_enabled:
            for part in parts:
                if isinstance(part, dict):
                    func_call = part.get("functionCall")
                    if isinstance(func_call, dict) and func_call.get("name") == MY_JOB_RECOMMENDATION_TOOL_NAME:
                        return MyJobRecommendationIntent()

        # Check for text response
        text_parts: list[str] = []
        for part in parts:
            if isinstance(part, dict) and "text" in part:
                text_val = part["text"]
                if isinstance(text_val, str):
                    text_parts.append(text_val)

        answer = unicodedata.normalize("NFC", "\n".join(text_parts)).strip()
        if (
            not answer
            or len(answer) > MAXIMUM_ANSWER_CHARACTERS
            or len(answer.encode("utf-8")) > MAXIMUM_ANSWER_BYTES
            or _contains_unsafe_control(answer)
        ):
            raise ChatProviderUnavailable("gemini provider returned invalid answer")

        return ChatText(answer=answer)


def _contains_unsafe_control(value: str) -> bool:
    return any(
        (ord(character) < 32 and character not in {"\n", "\t"})
        or 127 <= ord(character) <= 159
        for character in value
    )


class _DeadlineByteStream(httpx.SyncByteStream):
    def __init__(
        self,
        stream: httpx.SyncByteStream,
        deadline: float,
        request: httpx.Request,
    ) -> None:
        self._stream = stream
        self._deadline = deadline
        self._request = request

    def __iter__(self):
        for chunk in self._stream:
            if monotonic() >= self._deadline:
                self._stream.close()
                raise httpx.ReadTimeout(
                    "provider request deadline exceeded",
                    request=self._request,
                )
            yield chunk

    def close(self) -> None:
        self._stream.close()


class _TotalDeadlineTransport(httpx.BaseTransport):
    """Adds a wall-clock bound between already bounded network reads."""

    def __init__(
        self,
        timeout_seconds: float,
        *,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self._timeout_seconds = timeout_seconds
        self._transport = transport or httpx.HTTPTransport(
            retries=0,
            trust_env=False,
        )

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        deadline = monotonic() + self._timeout_seconds
        response = self._transport.handle_request(request)
        if monotonic() >= deadline:
            response.close()
            raise httpx.ReadTimeout(
                "provider request deadline exceeded",
                request=request,
            )
        return httpx.Response(
            response.status_code,
            headers=response.headers,
            stream=_DeadlineByteStream(response.stream, deadline, request),
            extensions=response.extensions,
            request=request,
        )

    def close(self) -> None:
        self._transport.close()
