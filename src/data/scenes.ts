export interface SceneGuideRef {
  slug: string;
  title: string;
}

export interface Scene {
  slug: string;
  title: string;
  description: string;
  lawSlugs: string[];
  guides?: SceneGuideRef[];
}

export interface SceneCategory {
  id: string;
  title: string;
  description: string;
  scenes: Scene[];
}

export function getAllScenes(categories: readonly SceneCategory[]): Scene[] {
  return categories.flatMap((cat) => cat.scenes);
}

export function getSceneIndex(
  categories: readonly SceneCategory[],
): Map<string, { scene: Scene; categoryTitle: string }> {
  const index = new Map<string, { scene: Scene; categoryTitle: string }>();
  for (const cat of categories) {
    for (const s of cat.scenes) {
      index.set(s.slug, { scene: s, categoryTitle: cat.title });
    }
  }
  return index;
}

export const sceneCategories: SceneCategory[] = [
  {
    id: "students",
    title: "子どもへの指導・対応",
    description: "児童生徒への指導・対応の法的根拠を確かめたいとき",
    scenes: [
      {
        slug: "bullying",
        title: "いじめへの対応",
        description:
          "いじめの認知・対応や重大事態への対処の法的根拠と、国の基本方針・ガイドラインの所在を示します。",
        lawSlugs: ["bullying-prevention-act", "school-education-act"],
      },
      {
        slug: "corporal-punishment",
        title: "体罰と懲戒・指導の境界",
        description:
          "体罰の禁止と、正当な懲戒・指導の範囲をめぐる法的根拠と、公式の解説の所在を示します。",
        lawSlugs: ["school-education-act"],
      },
      {
        slug: "child-abuse",
        title: "児童虐待の発見・通告",
        description:
          "児童虐待を発見・把握したときの通告と学校の対応について、関係法令と公式の手引きの所在を示します。",
        lawSlugs: [
          "child-abuse-prevention-act",
          "child-welfare-act",
          "school-education-act",
        ],
      },
      {
        slug: "copyright",
        title: "授業での著作物利用（教材コピー）",
        description:
          "授業のために著作物を複製・公衆送信するときのルールについて、法令と公式の運用指針の所在を示します。",
        lawSlugs: ["copyright-act"],
      },
      {
        slug: "disclosure-request",
        title: "保護者からの個人情報開示請求",
        description:
          "保護者からの個人情報の開示請求への対応について、法令と公式の留意事項の所在を示します。",
        lawSlugs: ["personal-information-protection-act"],
      },
      {
        slug: "school-refusal",
        title: "不登校への対応",
        description:
          "不登校児童生徒への対応について、教育機会確保法に基づく国・学校の責務と、文部科学省の基本指針・支援通知の所在を示します。",
        lawSlugs: ["education-opportunity-assurance-act", "school-education-act"],
      },
    ],
  },
  {
    id: "parents-safety",
    title: "保護者・事故・ハラスメント",
    description: "保護者対応や学校で起きた事故・不当な要求に直面したとき",
    scenes: [
      {
        slug: "parent-response",
        title: "保護者対応・過剰な苦情",
        description:
          "保護者からの過剰な苦情や不当な要求について、文部科学省・教育委員会・スクールロイヤー等の公的な支援と相談先の所在を整理します。",
        lawSlugs: [],
        guides: [{ slug: "parent-response", title: "保護者対応" }],
      },
      {
        slug: "customer-harassment",
        title: "カスタマーハラスメント",
        description:
          "教職員を不当な要求やカスタマーハラスメントから守る雇用主(学校の設置者)の措置義務について、厚生労働省・総務省・e-Gov 等の公的な情報の所在を整理します。",
        lawSlugs: [],
        guides: [
          { slug: "customer-harassment", title: "カスタマーハラスメント対策" },
        ],
      },
      {
        slug: "school-accident",
        title: "学校管理下の事故",
        description:
          "学校管理下で児童生徒等が事故にあったときの災害共済給付、文部科学省の学校事故対応指針、関わる法令について、日本スポーツ振興センター・e-Gov 等の公的な情報の所在を整理します。",
        lawSlugs: [],
        guides: [{ slug: "school-accident", title: "学校管理下の事故" }],
      },
    ],
  },
  {
    id: "health-work",
    title: "自分の健康と働き方",
    description: "心身の不調・長時間労働・休業など自分の働き方を守りたいとき",
    scenes: [
      {
        slug: "teacher-mental-health",
        title: "心の不調・休職と復職",
        description:
          "教員の心の不調による休職・復職について、文部科学省・厚生労働省等の公的な支援と相談先の所在を整理します。公務災害の認定と補償は専用ガイドに案内します。",
        lawSlugs: [],
        guides: [
          { slug: "teacher-mental-health", title: "メンタルヘルスと休職・復職" },
        ],
      },
      {
        slug: "occupational-injury",
        title: "公務災害（認定と補償）",
        description:
          "公務上の負傷や過労による疾患(精神疾患・脳血管疾患・心臓疾患)の公務災害認定と、補償の種類・認定請求の手続について、地方公務員災害補償基金・e-Gov 等の公的な情報の所在を整理します。",
        lawSlugs: [],
        guides: [{ slug: "occupational-injury", title: "公務災害" }],
      },
      {
        slug: "occupational-safety-health",
        title: "職場の安全衛生体制",
        description:
          "教職員の安全と健康を守るため学校の設置者に求められる衛生管理者・産業医・衛生委員会・衛生推進者の選任や面接指導・ストレスチェックの体制について、文部科学省・e-Gov 等の公的な情報の所在を整理します。",
        lawSlugs: [],
        guides: [
          {
            slug: "occupational-safety-health",
            title: "労働安全衛生管理体制",
          },
        ],
      },
      {
        slug: "work-style-reform",
        title: "長時間労働・働き方改革",
        description:
          "教員の長時間勤務の是正と働き方改革について、文部科学省の方針・勤務時間の上限に関する指針・給特法等の公的な方針と資料の所在を整理します。",
        lawSlugs: [],
        guides: [{ slug: "work-style-reform", title: "働き方改革" }],
      },
      {
        slug: "childcare-work-balance",
        title: "妊娠・出産・育児との両立",
        description:
          "教員(地方公務員)の妊娠・出産・育児と仕事の両立について、産前産後休暇・育児休業・部分休業などの制度と、総務省・e-Gov 等の公的な情報の所在を整理します。",
        lawSlugs: [],
        guides: [
          { slug: "childcare-work-balance", title: "妊娠・出産・育児との両立" },
        ],
      },
    ],
  },
  {
    id: "status-career",
    title: "身分・任用・資格",
    description: "処分・任用形態・免許など自分の身分や資格を確かめたいとき",
    scenes: [
      {
        slug: "disciplinary-disposition",
        title: "懲戒・分限処分と不服申立て",
        description:
          "教員の懲戒処分・分限処分と、不利益処分を受けたときの審査請求について、文部科学省・総務省・人事委員会等の公的な情報の所在を整理します。",
        lawSlugs: [],
        guides: [
          { slug: "disciplinary-disposition", title: "懲戒・分限処分" },
        ],
      },
      {
        slug: "non-regular-teachers",
        title: "非正規（臨任・会計年度）の任用",
        description:
          "公立学校の臨時的任用職員・会計年度任用職員(いわゆる非正規の教員)の任用と勤務条件について、総務省・文部科学省・e-Gov 等の公的な情報の所在を整理します。",
        lawSlugs: [],
        guides: [{ slug: "non-regular-teachers", title: "非正規の教員" }],
      },
      {
        slug: "teacher-license",
        title: "教員免許の確認・更新",
        description:
          "教員免許の有効性や各種手続の確認について、法令と文部科学省の Q&A の所在を示します。",
        lawSlugs: ["teacher-license-act"],
      },
    ],
  },
];
