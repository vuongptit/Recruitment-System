import type { BuilderContent, CandidateProfile, CvDesign } from "./person1Api";

export const cvTemplates = {
  classic: { label: "Chuyên nghiệp", description: "Một cột, đầu trang căn giữa, đường phân mục", accent: "#263c59", nameSize: 24, lineHeight: 1.25, columns: 1, leftWidth: 60, personalPosition: "top", horizontalMargin: 16, verticalMargin: 15 },
  minimal: { label: "Tối giản", description: "Một cột, căn trái, chữ đen và ít chi tiết", accent: "#30383e", nameSize: 21, lineHeight: 1.2, columns: 1, leftWidth: 60, personalPosition: "top", horizontalMargin: 19, verticalMargin: 17 },
  modern: { label: "Hiện đại", description: "Đầu trang rộng, nội dung chia hai cột", accent: "#006e2e", nameSize: 24, lineHeight: 1.25, columns: 2, leftWidth: 60, personalPosition: "top", horizontalMargin: 14, verticalMargin: 14 },
  creative: { label: "Sáng tạo", description: "Dải màu đậm và cột thông tin cá nhân", accent: "#6b3b87", nameSize: 25, lineHeight: 1.35, columns: 2, leftWidth: 34, personalPosition: "left", horizontalMargin: 13, verticalMargin: 14 },
} as const;
export type CvTemplateId = keyof typeof cvTemplates;

export const cvDesignRanges = {
  fontSize: { min: 8, max: 14, step: 0.5 },
  lineHeight: { min: 1.05, max: 1.7, step: 0.05 },
  horizontalMargin: { min: 8, max: 26, step: 1 },
  verticalMargin: { min: 8, max: 26, step: 1 },
  leftWidth: { min: 28, max: 72, step: 1 },
};

export function resolveCvDesign(template: CvTemplateId, saved?: Partial<CvDesign> | null): CvDesign {
  const preset = cvTemplates[template];
  function value(key: keyof typeof cvDesignRanges, fallback: number) {
    const input = saved?.[key];
    const { min, max } = cvDesignRanges[key];
    return typeof input === "number" && Number.isFinite(input) ? Math.min(max, Math.max(min, input)) : fallback;
  }
  const columns = saved?.columns === 1 || saved?.columns === 2 ? saved.columns : preset.columns;
  const position = saved?.personalPosition;
  return {
    fontSize: value("fontSize", 10), lineHeight: value("lineHeight", preset.lineHeight),
    horizontalMargin: value("horizontalMargin", preset.horizontalMargin), verticalMargin: value("verticalMargin", preset.verticalMargin),
    columns, leftWidth: value("leftWidth", preset.leftWidth),
    personalPosition: columns === 1 ? "top" : position === "left" || position === "right" || position === "top" ? position : preset.personalPosition,
    accent: typeof saved?.accent === "string" && /^#[0-9a-f]{6}$/i.test(saved.accent) ? saved.accent : preset.accent,
    pageNumbers: typeof saved?.pageNumbers === "boolean" ? saved.pageNumbers : false,
  };
}

export function cvLayout(content: BuilderContent, template: CvTemplateId) {
  const design = resolveCvDesign(template, content.design);
  const sections = content.sections.filter(section => section.text.trim());
  const split = design.columns === 2 && design.personalPosition === "top" && sections.length > 1
    ? Math.ceil(sections.length * design.leftWidth / 100) : sections.length;
  return { design, first: sections.slice(0, split), second: sections.slice(split) };
}
export function contentFromProfile(profile: CandidateProfile): BuilderContent {
  const section = (
    title: string,
    items: Record<string, unknown>[],
    keys: string[],
  ) => ({
    title,
    text: items
      .map((item) =>
        keys
          .map((k) => item[k])
          .filter(Boolean)
          .join(" · "),
      )
      .join("\n\n"),
  });
  return {
    fullName: profile.fullName ?? "",
    headline: profile.headline ?? "",
    summary: profile.summary ?? "",
    contact: [
      profile.phone,
      profile.address,
      profile.githubUrl,
      profile.linkedinUrl,
      profile.portfolioUrl,
    ]
      .filter(Boolean)
      .join(" · "),
    sections: [
      section("Kinh nghiệm", profile.experiences, [
        "companyName",
        "position",
        "startDate",
        "endDate",
        "description",
      ]),
      section("Học vấn", profile.educations, [
        "school",
        "major",
        "degree",
        "startDate",
        "endDate",
        "description",
      ]),
      section("Kỹ năng", profile.skills, ["name", "level"]),
      section("Chứng chỉ", profile.certificates, [
        "name",
        "issuer",
        "issuedAt",
        "credentialUrl",
      ]),
      section("Dự án", profile.projects, [
        "name",
        "role",
        "description",
        "url",
      ]),
    ],
  };
}
export function validateBuilder(value: unknown): BuilderContent {
  const v = value as BuilderContent;
  if (
    !v ||
    typeof v !== "object" ||
    !["fullName", "headline", "summary", "contact"].every(
      (k) => typeof (v as unknown as Record<string, unknown>)[k] === "string",
    ) ||
    !Array.isArray(v.sections) ||
    v.sections.length > 10 ||
    v.sections.some(
      (s) => !s || typeof s.title !== "string" || typeof s.text !== "string",
    ) ||
    JSON.stringify(v).length > 40000
  )
    throw new Error("Nội dung CV không hợp lệ hoặc vượt giới hạn.");
  return v;
}
export function buildCvDocument(content: BuilderContent, template: CvTemplateId) {
  validateBuilder(content);
  const { design, first, second } = cvLayout(content, template);
  const { accent, fontSize, lineHeight, columns, personalPosition, leftWidth } = design;
  const pt = (mm: number) => mm * 72 / 25.4;
  const horizontal = pt(design.horizontalMargin);
  const vertical = pt(design.verticalMargin);
  const alignment = template === "classic" ? "center" : "left";
  const rule = (width: number) => ({
    canvas: [{ type: "line", x1: 0, y1: 0, x2: width, y2: 0, lineWidth: 0.65, lineColor: accent }],
    margin: [0, 0, 0, 8],
  });
  const header = (width: number) => {
    const name = { text: content.fullName, fontSize: cvTemplates[template].nameSize, bold: true, color: accent, alignment, margin: [0, 0, 0, 5] };
    const headline = { text: content.headline, fontSize: fontSize + 2, alignment, margin: [0, 0, 0, 5] };
    const contact = { text: content.contact, color: "#3f4a48", alignment, margin: [0, 0, 0, 7] };
    if (template === "creative") {
      return { layout: "noBorders", margin: [0, 0, 0, 12], table: { widths: ["*"], body: [[{
        fillColor: accent,
        margin: [10, 9, 10, 4],
        stack: [{ ...name, color: "#ffffff" }, { ...headline, color: "#ffffff" }, { ...contact, color: "#ffffff" }],
      }]] } };
    }
    return { stack: [name, headline, contact, ...(template === "minimal" ? [] : [rule(width)])], margin: [0, 0, 0, 8] };
  };
  const renderSections = (items: typeof first) => items.flatMap(section => [
    {
      text: section.title,
      bold: true,
      fontSize: fontSize + (template === "minimal" ? 0.5 : 2),
      color: template === "minimal" ? "#27322f" : accent,
      ...(template === "modern" ? { decoration: "underline" } : {}),
      margin: [0, 7, 0, 4],
    },
    { text: section.text, margin: [0, 0, 0, 6] },
  ]);
  const summary = content.summary.trim() ? [{ text: content.summary, margin: [0, 0, 0, 9] }] : [];
  const width = 595.28 - horizontal * 2;
  const gap = 16;
  const left = (width - gap) * leftWidth / 100;
  const right = width - gap - left;
  let nodes: object[];
  if (columns === 1) {
    nodes = [header(width), ...summary, ...renderSections(first)];
  } else if (personalPosition === "top") {
    nodes = [header(width), ...summary, { columnGap: gap, columns: [
      { width: left, stack: renderSections(first) }, { width: right, stack: renderSections(second) },
    ] }];
  } else {
    const personal = { width: personalPosition === "left" ? left : right, stack: [header(personalPosition === "left" ? left : right), ...summary] };
    const main = { width: personalPosition === "left" ? right : left, stack: renderSections(first) };
    nodes = [{ columnGap: gap, columns: personalPosition === "left" ? [personal, main] : [main, personal] }];
  }
  return {
    pageSize: "A4",
    pageMargins: [horizontal, vertical, horizontal, vertical],
    defaultStyle: { font: "Roboto", fontSize, lineHeight, color: "#25332f" },
    info: { title: content.fullName + " — CV", author: content.fullName },
    ...(design.pageNumbers ? { footer: (page: number, count: number) => ({
      text: `${page} / ${count}`, alignment: "right", fontSize: 8, color: "#53645e", margin: [0, 5, horizontal, 0],
    }) } : {}),
    content: nodes,
  };
}

export async function renderCvPdf(content: BuilderContent, template: CvTemplateId): Promise<Blob> {
  const document = buildCvDocument(content, template);
  const [{ default: pdfMake }, { default: fonts }] = await Promise.all([
    import("pdfmake/build/pdfmake"),
    import("pdfmake/build/vfs_fonts"),
  ]);
  pdfMake.addVirtualFileSystem(fonts);
  return new Promise((resolve, reject) => {
    try {
      pdfMake.createPdf(document).getBlob(resolve);
    } catch (cause) {
      reject(cause);
    }
  });
}
