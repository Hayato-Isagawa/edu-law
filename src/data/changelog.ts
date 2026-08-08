// サイト更新履歴の正本データ(docs/decisions/0017)。
// /changelog/(表示)・/rss.xml(配信)・トップ「最近の更新」はここから導出する。
export type ChangeType = "add" | "update" | "fix" | "remove";

export interface ChangelogLink {
  label: string;
  href: string;
}

export interface ChangelogItem {
  type: ChangeType;
  text: string;
  links?: ChangelogLink[];
}

export interface ChangelogEntry {
  date: string;
  items: ChangelogItem[];
}

export const typeLabel: Record<ChangeType, { label: string; color: string }> = {
  add: { label: "追加", color: "text-emerald-700" },
  update: { label: "更新", color: "text-amber-700" },
  fix: { label: "修正", color: "text-rose-700" },
  remove: { label: "削除", color: "text-[var(--color-sub)]" },
};

export const changelogEntries: ChangelogEntry[] = [
  {
    date: "2026-08-08",
    items: [
      {
        type: "fix",
        text: "Safari でお気に入り・ブックマークに登録したときに、サイトのアイコンが出ず空白になっていたのを直しました",
      },
    ],
  },
  {
    date: "2026-08-05",
    items: [
      {
        type: "fix",
        text: "存在しない URL を開いたときに、トップページがそのまま表示されて「見つからなかった」と分からない状態になっていました。専用のページを出すようにしました",
      },
    ],
  },
  {
    date: "2026-08-04",
    items: [
      {
        type: "fix",
        text: "カスタマーハラスメントのガイドから、厚生労働省の対策企業マニュアルに辿り着けなくなっていた問題を修正しました",
        links: [
          { label: "カスタマーハラスメント", href: "/guides/customer-harassment/" },
        ],
      },
    ],
  },
  {
    date: "2026-07-18",
    items: [
      {
        type: "add",
        text: "サイト内の法令・ガイド・場面をキーワードで検索できるようにしました",
      },
      {
        type: "fix",
        text: "ダークモードの検索ページで、検索アイコン・案内文字・入力欄・検索結果が背景に沈んで読みづらかった問題を修正しました",
        links: [{ label: "検索", href: "/search/" }],
      },
    ],
  },
  {
    date: "2026-07-15",
    items: [
      {
        type: "update",
        text: "SNS やチャットでリンクを共有したときのプレビュー画像を、姉妹サイト共通のデザインに刷新しました",
      },
    ],
  },
  {
    date: "2026-07-12",
    items: [
      {
        type: "add",
        text: "「このサイトについて」(about)に運営者の紹介(元小学校教諭・現場経験約 10 年)を追加しました。誰が整理しているサイトかを確認できます",
        links: [{ label: "このサイトについて", href: "/about/" }],
      },
    ],
  },
  {
    date: "2026-06-24",
    items: [
      {
        type: "add",
        text: "「このサイトについて」(about)に、姉妹サイト(EduEvidence JP・EduWatch JP)との関係を「1 本の木」として紹介する説明を追加しました",
      },
    ],
  },
  {
    date: "2026-06-22",
    items: [
      {
        type: "add",
        text: "メニューに姉妹サイトへの導線を追加しました。教育エビデンスの EduEvidence JP と教育ニュースの EduWatch JP へ、サイト内から直接たどれます",
      },
    ],
  },
  {
    date: "2026-06-18",
    items: [
      {
        type: "add",
        text: "「学校の保健・安全」の場面カテゴリを新設し、感染症対策・健康診断と学校安全計画・危機管理から、学校保健安全法と文部科学省の公式解説を引けるようにしました",
        links: [{ label: "場面から探す", href: "/scenes/#school-health-safety" }],
      },
    ],
  },
  {
    date: "2026-06-17",
    items: [
      {
        type: "add",
        text: "「不登校への対応」の場面を新設し、教育機会確保法のページを法令一覧に追加しました。不登校児童生徒への対応について、教育機会確保法に基づく国・学校の責務と、文部科学省の基本指針・支援通知の所在を 1 ページで確認できます",
        links: [
          { label: "不登校への対応", href: "/scenes/#students" },
          { label: "教育機会確保法", href: "/laws/education-opportunity-assurance-act/" },
        ],
      },
    ],
  },
  {
    date: "2026-06-15",
    items: [
      {
        type: "update",
        text: "サイトの構成を見直し、いじめ・保護者対応・著作物の授業利用・公務災害・働き方などの「場面」から、関連する法令と公式解説・ガイドを引ける「場面から探す」を新設しました。困りごとから必要な情報にたどり着きやすくしました",
        links: [{ label: "場面から探す", href: "/scenes/" }],
      },
    ],
  },
  {
    date: "2026-06-11",
    items: [
      {
        type: "update",
        text: "サイトの更新を追いやすく改善しました。トップページに「最近の更新」を追加し、RSS フィードは更新履歴(何が変わったか)を配信する方式に変更し、更新履歴の各項目に該当ページへのリンクを追加しました",
      },
    ],
  },
  {
    date: "2026-06-10",
    items: [
      {
        type: "update",
        text: "「教師を守る」のガイド 10 本を「保護者・外部への対応」「心身の健康と安全」「勤務条件と身分」の 3 グループに整理しました。入口ページとガイド一覧の両方で、目的のガイドを見つけやすくしました",
        links: [
          { label: "教師を守る", href: "/scenes/" },
          { label: "ガイド一覧", href: "/guides/" },
        ],
      },
    ],
  },
  {
    date: "2026-06-09",
    items: [
      {
        type: "update",
        text: "いじめ防止対策推進法ページで案内する文部科学省『いじめの重大事態の調査に関するガイドライン』を、最新の令和6年8月改訂版に更新しました",
        links: [{ label: "いじめ防止対策推進法", href: "/laws/bullying-prevention-act/" }],
      },
      {
        type: "update",
        text: "児童虐待防止法ページで案内する文部科学省『学校・教育委員会等向け 虐待対応の手引き』を、最新の令和8年5月改訂版に更新しました",
        links: [{ label: "児童虐待防止法", href: "/laws/child-abuse-prevention-act/" }],
      },
    ],
  },
  {
    date: "2026-06-08",
    items: [
      {
        type: "add",
        text: "保護者対応をめぐる自治体の動向に、川崎市・北海道七飯町の各教育委員会の公式情報への導線を追加しました。東京都とあわせて、家庭・地域と学校の関係づくりに関する各自治体の指針を確認できます",
        links: [{ label: "保護者対応", href: "/guides/parent-response/" }],
      },
    ],
  },
  {
    date: "2026-05-28",
    items: [
      {
        type: "add",
        text: "教育基本法のページを法令一覧に追加しました。教育の目的・理念や国・地方公共団体の責務など教育の基本について、文部科学省『教育基本法資料室』の公式解説や e-Gov 法令本文への入口を 1 ページで確認できます",
        links: [{ label: "教育基本法", href: "/laws/basic-act-on-education/" }],
      },
    ],
  },
  {
    date: "2026-05-27",
    items: [
      {
        type: "add",
        text: "学校保健安全法のページを法令一覧に追加しました。健康診断・感染症による出席停止・学校環境衛生(学校保健)や、学校安全計画・危機管理マニュアル(学校安全)について、文部科学省の公式解説や e-Gov 法令本文への入口を 1 ページで確認できます",
        links: [{ label: "学校保健安全法", href: "/laws/school-health-and-safety-act/" }],
      },
      {
        type: "add",
        text: "地方公務員法のページを法令一覧に追加しました。公立学校の教員を含む地方公務員の任用・給与・分限・懲戒・服務などの根本基準について、総務省「地方公務員制度」の公式解説や e-Gov 法令本文への入口を 1 ページで確認できます",
        links: [{ label: "地方公務員法", href: "/laws/local-public-service-act/" }],
      },
      {
        type: "add",
        text: "教育公務員特例法のページを法令一覧に追加しました。研修・資質向上(令和4年改正の研修記録、免許更新制の発展的解消)をめぐる文部科学省の指針・ガイドラインや e-Gov 法令本文への入口を 1 ページで確認できます",
        links: [{ label: "教育公務員特例法", href: "/laws/educational-public-service-special-act/" }],
      },
      {
        type: "update",
        text: "「子供への指導・対応」を独立したページにまとめ、「教師を守る」と対になる入口にしました。トップの 2 つの入口が同じ動きで開き、目的の一覧へたどり着きやすくなりました",
        links: [{ label: "子供への指導・対応", href: "/scenes/#students" }],
      },
    ],
  },
  {
    date: "2026-05-26",
    items: [
      {
        type: "add",
        text: "「教職員へのカスタマーハラスメント対策と雇用主の措置義務をめぐる公的な情報」ガイドページを公開しました。ハラスメント防止が事業主(公立学校では設置者)の雇用管理上の措置義務であること、2026年10月に施行が予定されるカスタマーハラスメント対策の義務化について、厚生労働省・総務省・e-Gov 等の公的な情報の所在を 1 ページで確認できます",
        links: [{ label: "カスタマーハラスメント対策", href: "/guides/customer-harassment/" }],
      },
      {
        type: "add",
        text: "「学校の労働安全衛生管理体制(衛生管理者・産業医ほか)をめぐる公的な情報」ガイドページを公開しました。衛生管理者・産業医・衛生委員会・衛生推進者の選任や面接指導・ストレスチェックの体制について、文部科学省『学校における労働安全衛生管理体制の整備のために(第3版)』・e-Gov 等の公的な情報の所在を 1 ページで確認できます",
        links: [{ label: "労働安全衛生管理体制", href: "/guides/occupational-safety-health/" }],
      },
      {
        type: "add",
        text: "「非正規の教員(臨時的任用・会計年度任用)の任用と勤務条件をめぐる公的な情報」ガイドページを公開しました。臨時的任用職員・会計年度任用職員の任用・勤務条件・給付について、総務省『会計年度任用職員制度の運用に係る事務処理マニュアル』・文部科学省・e-Gov 等の公的な情報の所在を 1 ページで確認できます",
        links: [{ label: "非正規の教員", href: "/guides/non-regular-teachers/" }],
      },
      {
        type: "add",
        text: "「教員の妊娠・出産・育児と仕事の両立をめぐる公的な情報」ガイドページを公開しました。産前産後休暇・育児休業・部分休業などの制度について、総務省『地方公務員 両立支援パスポート』・e-Gov 等の公的な情報の所在を 1 ページで確認できます",
        links: [{ label: "妊娠・出産・育児との両立", href: "/guides/childcare-work-balance/" }],
      },
      {
        type: "add",
        text: "「教師を守る」入口ページを公開しました。保護者対応・メンタルヘルス・公務災害・働き方改革・懲戒分限処分・学校事故の各ガイドへの導線を 1 ページにまとめ、教師自身を守る制度の入口をまとめて見渡せます",
        links: [{ label: "教師を守る", href: "/scenes/" }],
      },
    ],
  },
  {
    date: "2026-05-25",
    items: [
      {
        type: "add",
        text: "「学校管理下の事故の補償と責任をめぐる公的な情報」ガイドページを公開しました。学校管理下で児童生徒が事故にあったときの災害共済給付、文部科学省の学校事故対応指針、関わる法令の所在を 1 ページで確認できます",
        links: [{ label: "学校事故の補償と責任", href: "/guides/school-accident/" }],
      },
      {
        type: "add",
        text: "「教員の公務災害(認定と補償)をめぐる公的な情報」ガイドページを公開しました。公務上の負傷や過労による疾患の公務災害認定、補償の種類、認定請求の手続について、地方公務員災害補償基金等の公的な情報の所在を 1 ページで確認できます",
        links: [{ label: "公務災害", href: "/guides/occupational-injury/" }],
      },
    ],
  },
  {
    date: "2026-05-24",
    items: [
      {
        type: "add",
        text: "「教員の懲戒・分限処分と不服申立てをめぐる公的な情報」ガイドページを公開しました。懲戒・分限処分の状況や各自治体の処分基準、不利益処分を受けたときの人事委員会への審査請求について、文部科学省・総務省・人事委員会等の公的な情報の所在を 1 ページで確認できます",
        links: [{ label: "懲戒・分限処分", href: "/guides/disciplinary-disposition/" }],
      },
      {
        type: "update",
        text: "トップページとガイド一覧を「子供への指導・対応」「教師を守る」の 2 つの入口に整理しました。目的に合わせて、関連法令と公的な支援のどちらの入口から探すかを選べます",
        links: [{ label: "ガイド一覧", href: "/guides/" }],
      },
      {
        type: "add",
        text: "「教員の長時間労働と働き方改革をめぐる国の方針」ガイドページを公開しました。勤務時間の上限に関する指針・給特法・取り組み事例など、働き方改革をめぐる公的な方針と資料の所在を 1 ページで確認できます",
        links: [{ label: "働き方改革", href: "/guides/work-style-reform/" }],
      },
      {
        type: "add",
        text: "「教員のメンタルヘルスと休職・復職をめぐる公的な支援と相談先」ガイドページを公開しました。心の不調による休職・復職、ストレスチェック、公務災害の認定について、文部科学省・厚生労働省・地方公務員災害補償基金等の公的な支援と相談先の所在を 1 ページで確認できます",
        links: [{ label: "メンタルヘルスと休職・復職", href: "/guides/teacher-mental-health/" }],
      },
      {
        type: "add",
        text: "「保護者対応をめぐる公的な支援と相談先」ガイドページを公開しました。保護者からの過剰な苦情や不当な要求について、文部科学省・教育委員会・スクールロイヤー等の公的な支援と相談先の所在を 1 ページで確認できます",
        links: [{ label: "保護者対応", href: "/guides/parent-response/" }],
      },
    ],
  },
  {
    date: "2026-05-21",
    items: [
      {
        type: "add",
        text: "「日本の法令階層」ガイドページを公開しました。法律から告示・通達までの 7 種別を、制定主体・根拠条文・e-Gov 法令検索リンクとあわせて整理しました。教師が現場で出会う通知・指針・指導要領が法体系のどこに位置するかを確認できます",
        links: [{ label: "日本の法令階層", href: "/guides/legal-hierarchy/" }],
      },
    ],
  },
];
