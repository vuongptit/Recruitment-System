package com.recruitment.application.pipeline;

import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class CandidateNameResolver {
    private static final Logger log = LoggerFactory.getLogger(CandidateNameResolver.class);
    private final NamedParameterJdbcTemplate jdbc;

    public CandidateNameResolver(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Map<UUID, String> resolveNames(List<UUID> candidateIds) {
        if (candidateIds == null || candidateIds.isEmpty()) {
            return Collections.emptyMap();
        }
        try {
            String sql = """
                SELECT u.id AS user_id,
                       COALESCE(NULLIF(TRIM(p.full_name), ''), u.email, 'Ứng viên') AS name
                FROM auth.users u
                LEFT JOIN profile.profiles p ON u.id = p.user_id
                WHERE u.id IN (:ids)
                """;
            MapSqlParameterSource params = new MapSqlParameterSource("ids", candidateIds);
            Map<UUID, String> map = new HashMap<>();
            jdbc.query(sql, params, rs -> {
                UUID userId = (UUID) rs.getObject("user_id");
                String name = rs.getString("name");
                if (userId != null && name != null) {
                    map.put(userId, name);
                }
            });
            return map;
        } catch (Exception ex) {
            log.warn("Could not batch resolve candidate names: {}", ex.getMessage());
            return Collections.emptyMap();
        }
    }

    public String resolveName(UUID candidateId) {
        if (candidateId == null) {
            return "Ứng viên";
        }
        Map<UUID, String> map = resolveNames(List.of(candidateId));
        return map.getOrDefault(candidateId, "Ứng viên");
    }
}
