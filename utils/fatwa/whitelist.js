// Curated Whitelist of Verified Islamic Fatwa Websites
// Strictly answers ONLY from these domains to ensure zero hallucination.

const WHITELISTED_DOMAINS = [
  {
    id: "alkawsar",
    name: "মাসিক আলকাউসার",
    fullName: "মারকাযুদ দাওয়াহ আলইসলামিয়া ঢাকা (মাসিক আলকাউসার)",
    domain: "alkawsar.com",
    badgeColor: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800",
    description: "মারকাযুদ দাওয়াহ আলইসলামিয়া ঢাকার গবেষণা ও ফাতওয়া বিভাগ"
  },
  {
    id: "darulifta-deoband",
    name: "দারুল উলূম দেওবন্দ",
    fullName: "দারুল উলূম দেওবন্দ (দারুল ইফতা)",
    domain: "darulifta-deoband.com",
    badgeColor: "bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800",
    description: "ঐতিহাসিক দারুল উলূম দেওবন্দের আন্তর্জাতিক অনলাইন দারুল ইফতা"
  },
  {
    id: "ahlehaqmedia",
    name: "আহলে হক মিডিয়া",
    fullName: "আহলে হক মিডিয়া (মুফতি লুৎফুর রহমান ফরায়েজী)",
    domain: "ahlehaqmedia.com",
    badgeColor: "bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800",
    description: "মুফতি লুৎফুর রহমান ফরায়েজী পরিচালিত নির্ভরযোগ্য ফতোয়া পোর্টাল"
  },
  {
    id: "fatwabd",
    name: "ফতোয়াবিডি",
    fullName: "ফতোয়াবিডি ডটকম",
    domain: "fatwabd.com",
    badgeColor: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800",
    description: "উভয় বাংলার প্রখ্যাত মুফতিগণের ফতোয়ার সংকলন"
  },
  {
    id: "islamqa-org",
    name: "IslamQA (Hanafi)",
    fullName: "IslamQA Hanafi Fiqh Collection",
    domain: "islamqa.org",
    badgeColor: "bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800",
    description: "হানাফি ফিকহের প্রামাণ্য আন্তর্জাতিক ফতোয়া সম্ভার"
  }
];

function isWhitelistedUrl(urlStr) {
  if (!urlStr || typeof urlStr !== "string") return false;
  try {
    const parsed = new URL(urlStr.trim());
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    return WHITELISTED_DOMAINS.some((w) => {
      const targetDomain = w.domain.toLowerCase().replace(/^www\./, "");
      return hostname === targetDomain || hostname.endsWith(`.${targetDomain}`);
    });
  } catch {
    return false;
  }
}

function getDomainInfo(urlStr) {
  if (!urlStr) return null;
  try {
    const parsed = new URL(urlStr.trim());
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    return (
      WHITELISTED_DOMAINS.find((w) => {
        const targetDomain = w.domain.toLowerCase().replace(/^www\./, "");
        return hostname === targetDomain || hostname.endsWith(`.${targetDomain}`);
      }) || null
    );
  } catch {
    return null;
  }
}

function getSiteQueryFilter() {
  return WHITELISTED_DOMAINS.map((w) => `site:${w.domain}`).join(" OR ");
}

module.exports = {
  WHITELISTED_DOMAINS,
  isWhitelistedUrl,
  getDomainInfo,
  getSiteQueryFilter,
};
