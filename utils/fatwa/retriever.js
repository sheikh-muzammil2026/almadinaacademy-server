const {
  WHITELISTED_DOMAINS,
  isWhitelistedUrl,
  getDomainInfo,
  getSiteQueryFilter,
} = require("./whitelist");
const {
  fetchArticleHtml,
  cleanAndExtractArticle,
  decodeHtmlEntities,
} = require("./extractor");

function isCandidateArticleUrl(url) {
  if (!url || typeof url !== "string") return false;
  const u = url.toLowerCase();
  if (
    u.endsWith(".com/") ||
    u.endsWith(".com") ||
    u.endsWith(".com/bn") ||
    u.endsWith(".com/bn/") ||
    u.includes("/topics/") ||
    u.includes("/category/") ||
    u.includes("/tag/") ||
    u.includes("/author/") ||
    u.includes("/page/") ||
    u.includes("?s=") ||
    u.includes("/search/")
  ) {
    return false;
  }
  if (u.includes("alkawsar.com") && !u.includes("/article/")) {
    return false;
  }
  return true;
}

function generateSearchVariants(query) {
  if (!query || typeof query !== "string") return [];
  const clean = query.trim();

  const stopWords = [
    "সম্পর্কে", "বিধান", "কী", "কি", "হুকুম", "বলুন", "জানতে", "চাই", "করার",
    "নিয়ে", "নিয়ে", "নিয়ম", "নিয়ম", "শরীয়তের", "শরীয়তের", "হলে", "কিনা",
    "এর", "এবং", "ও", "বা", "থেকে", "দিয়ে", "দিয়ে", "করা", "জন্য", "আছে", "হয়",
    "অবস্থায়", "অবস্থায়", "পদ্ধতি", "উপায়", "উপায়", "সঠিক", "হিসাব", "আদায়ের", "আদায়ের",
    "পর", "পরে", "আগে", "মধ্যে", "কোন", "কোনো", "কীভাবে", "কিভাবে", "নেয়া", "নেয়া"
  ];

  const stripSuffix = (word) => {
    return word.replace(/(?:ের|দের|গুলো|গুলি|টিতে|টিতেও|তে|কে|র)$/, "");
  };

  const words = clean.split(/\s+/).filter((w) => w.length >= 2);
  const meaningfulWords = words
    .filter((w) => !stopWords.includes(w.toLowerCase()))
    .map((w) => stripSuffix(w))
    .filter((w) => w.length >= 2 && !stopWords.includes(w.toLowerCase()));

  const terms = [];

  const getWordVariants = (w) => {
    const list = [w];
    if (w.includes("মোনাজাত")) list.push(w.replace(/মোনাজাত/g, "মুনাজাত"));
    if (w.includes("মুনাজাত")) list.push(w.replace(/মুনাজাত/g, "মোনাজাত"));
    if (w.includes("রোজা")) list.push(w.replace(/রোজা/g, "রোযা"));
    if (w.includes("রোযা")) list.push(w.replace(/রোযা/g, "রোজা"));
    if (w.includes("নামাজ")) list.push(w.replace(/নামাজ/g, "নামায"));
    if (w.includes("নামায")) list.push(w.replace(/নামায/g, "নামাজ"));
    if (w.includes("কাজা")) list.push(w.replace(/কাজা/g, "কাযা"));
    if (w.includes("কাযা")) list.push(w.replace(/কাযা/g, "কাজা"));
    if (w.includes("ইনজেকশন")) list.push(w.replace(/ইনজেকশন/g, "ইঞ্জেকশন"));
    if (w.includes("ইঞ্জেকশন")) list.push(w.replace(/ইঞ্জেকশন/g, "ইনজেকশন"));
    return Array.from(new Set(list));
  };

  const addTermWithVariants = (term) => {
    if (!term || term.length < 2) return;
    const parts = term.split(/\s+/);
    if (parts.length === 1) {
      for (const v of getWordVariants(parts[0])) {
        if (!terms.includes(v)) terms.push(v);
      }
      return;
    }

    if (parts.length === 2) {
      const v0 = getWordVariants(parts[0]);
      const v1 = getWordVariants(parts[1]);
      for (const a of v0) {
        for (const b of v1) {
          const combo = `${a} ${b}`;
          if (!terms.includes(combo)) terms.push(combo);
        }
      }
      return;
    }

    if (!terms.includes(term)) terms.push(term);
  };

  if (meaningfulWords.length >= 2) {
    addTermWithVariants(meaningfulWords[0] + " " + meaningfulWords[1]);
    if (meaningfulWords.length > 2) {
      addTermWithVariants(meaningfulWords[0] + " " + meaningfulWords[meaningfulWords.length - 1]);
    }
  }

  for (const w of meaningfulWords) {
    if (w.length >= 3) {
      addTermWithVariants(w);
    }
  }

  if (meaningfulWords.length > 2) {
    addTermWithVariants(meaningfulWords.join(" "));
  }

  addTermWithVariants(clean);

  return terms;
}

async function searchAhlehaq(searchTerms) {
  const discovered = new Map();
  const pairTerms = searchTerms.filter((t) => t.includes(" "));
  const singleTerms = searchTerms.filter((t) => !t.includes(" "));
  const topTerms = [...pairTerms.slice(0, 3), ...singleTerms.slice(0, 3)].slice(0, 6);

  const promises = topTerms.map(async (term) => {
    try {
      const endpoint = `https://ahlehaqmedia.com/?s=${encodeURIComponent(term)}`;
      const res = await fetch(endpoint, {
        signal: AbortSignal.timeout(6000),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "bn-BD,bn;q=0.9,en;q=0.8",
        },
      });

      if (res.ok) {
        const html = await res.text();
        const articleMatches = [
          ...html.matchAll(
            /<h2[^>]*class=["'][^"']*post-box-title[^"']*["'][^>]*>[\s\S]*?<a\s+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
          ),
        ];

        for (const m of articleMatches) {
          const url = m[1].trim();
          const title = decodeHtmlEntities(m[2].replace(/<[^>]+>/g, "").trim());
          if (isWhitelistedUrl(url) && isCandidateArticleUrl(url)) {
            discovered.set(url, title);
          }
        }
      }
    } catch (_) {}
  });

  await Promise.allSettled(promises);
  return Array.from(discovered.entries()).map(([url, title]) => ({ url, title }));
}

async function searchAlkawsar(searchTerms) {
  const discovered = new Map();
  const pairTerms = searchTerms.filter((t) => t.includes(" "));
  const singleTerms = searchTerms.filter((t) => !t.includes(" "));
  const topTerms = [...pairTerms.slice(0, 3), ...singleTerms.slice(0, 3)].slice(0, 6);

  const promises = topTerms.map(async (term) => {
    try {
      const endpoint = `https://www.alkawsar.com/bn/search/?q=${encodeURIComponent(term)}`;
      const res = await fetch(endpoint, {
        signal: AbortSignal.timeout(6000),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "bn-BD,bn;q=0.9,en;q=0.8",
        },
      });

      if (res.ok) {
        const html = await res.text();
        const matches = [
          ...html.matchAll(
            /<a\s+href=["'](\/bn\/article\/\d+\/)["'][^>]*>([\s\S]*?)<\/a>/gi
          ),
        ];

        for (const m of matches) {
          const fullUrl = `https://www.alkawsar.com${m[1]}`;
          const title = decodeHtmlEntities(m[2].replace(/<[^>]+>/g, "").trim());
          if (isWhitelistedUrl(fullUrl) && isCandidateArticleUrl(fullUrl)) {
            discovered.set(fullUrl, title);
          }
        }
      }
    } catch (_) {}
  });

  await Promise.allSettled(promises);
  return Array.from(discovered.entries()).map(([url, title]) => ({ url, title }));
}

function unwrapTargetUrl(rawHref) {
  if (!rawHref) return null;
  try {
    let cleanHref = rawHref.trim();
    if (cleanHref.startsWith("//")) {
      cleanHref = "https:" + cleanHref;
    }
    if (cleanHref.includes("duckduckgo.com/l/?") || cleanHref.includes("uddg=")) {
      const urlObj = new URL(cleanHref);
      const uddg = urlObj.searchParams.get("uddg");
      if (uddg) return decodeURIComponent(uddg);
    }
    return cleanHref;
  } catch {
    return null;
  }
}

async function searchDuckDuckGoFallback(query) {
  const discovered = [];
  try {
    const siteFilter = getSiteQueryFilter();
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(`${siteFilter} ${query}`)}`;

    const res = await fetch(searchUrl, {
      signal: AbortSignal.timeout(9000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "bn-BD,bn;q=0.9,en;q=0.8",
      },
    });

    if (res.ok) {
      const html = await res.text();
      const linkRegex =
        /<a[^>]+class=["'][^"']*(?:result__url|result__snippet|result__title)[^"']*["'][^>]+href=["']([^"']+)["']/gi;
      let match;
      while ((match = linkRegex.exec(html)) !== null) {
        const unwrapped = unwrapTargetUrl(match[1]);
        if (unwrapped && isWhitelistedUrl(unwrapped) && isCandidateArticleUrl(unwrapped)) {
          discovered.push({ url: unwrapped, title: "" });
        }
      }
    }
  } catch (err) {
    console.warn("DuckDuckGo fallback search error:", err.message);
  }
  return discovered;
}

function scoreCandidate(query, candidate) {
  const qTokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter(
      (w) =>
        w.length >= 2 &&
        !["সম্পর্কে", "বিধান", "কী", "কি", "হুকুম", "বলুন", "জানতে", "চাই", "নেয়া", "নেয়া", "বা", "ও"].includes(w)
    );

  if (qTokens.length === 0) return 1;

  let score = 0;
  const titleLower = (candidate.title || "").toLowerCase();
  const urlLower = (candidate.url || "").toLowerCase();

  for (const token of qTokens) {
    if (token === "ইনজেকশন" && (titleLower.includes("ইনজেকশন") || titleLower.includes("ইঞ্জেকশন"))) {
      score += 40;
    } else if (token === "মোনাজাত" && (titleLower.includes("মোনাজাত") || titleLower.includes("মুনাজাত"))) {
      score += 40;
    } else if (token === "রোজা" && (titleLower.includes("রোজা") || titleLower.includes("রোযা"))) {
      score += 25;
    } else if (token === "নামাজ" && (titleLower.includes("নামাজ") || titleLower.includes("নামায"))) {
      score += 25;
    } else if (token === "কাযা" && (titleLower.includes("কাযা") || titleLower.includes("কাজা"))) {
      score += 35;
    } else if (token === "যাকাত" && titleLower.includes("যাকাত")) {
      score += 35;
    } else if (titleLower.includes(token)) {
      score += 20;
    }
    if (urlLower.includes(encodeURIComponent(token))) {
      score += 15;
    }
  }

  if (urlLower.includes("/article/") || /\/\d+\/?$/.test(urlLower) || urlLower.includes("/fatwa")) {
    score += 10;
  }

  return score;
}

async function retrieveWhitelistedFatwas(query, maxResults = 3) {
  if (!query || typeof query !== "string" || query.trim().length < 2) {
    return [];
  }

  const cleanQuery = query.trim();
  const searchTerms = generateSearchVariants(cleanQuery);

  const [ahlehaqResults, alkawsarResults] = await Promise.all([
    searchAhlehaq(searchTerms),
    searchAlkawsar(searchTerms),
  ]);

  let allCandidates = [...ahlehaqResults, ...alkawsarResults];

  if (allCandidates.length === 0) {
    const ddgResults = await searchDuckDuckGoFallback(cleanQuery);
    allCandidates = ddgResults;
  }

  const seenUrls = new Set();
  const scoredCandidates = [];

  for (const item of allCandidates) {
    if (!item.url || seenUrls.has(item.url)) continue;
    seenUrls.add(item.url);

    if (!isWhitelistedUrl(item.url) || !isCandidateArticleUrl(item.url)) continue;

    const score = scoreCandidate(cleanQuery, item);
    if (score > -50) {
      scoredCandidates.push({ ...item, score });
    }
  }

  scoredCandidates.sort((a, b) => b.score - a.score);

  const topCandidates = scoredCandidates.slice(0, Math.max(maxResults, 3));

  if (topCandidates.length === 0) {
    return [];
  }

  const fetchPromises = topCandidates.map(async (item) => {
    try {
      const { html, finalUrl } = await fetchArticleHtml(item.url);
      const article = cleanAndExtractArticle(html, finalUrl, cleanQuery);

      if (article.content && article.content.length > 80) {
        return article;
      }
      return null;
    } catch (err) {
      console.warn(`Failed to process article from ${item.url}:`, err.message);
      return null;
    }
  });

  const settled = await Promise.allSettled(fetchPromises);
  const articles = settled
    .filter((s) => s.status === "fulfilled" && s.value !== null)
    .map((s) => s.value);

  return articles;
}

module.exports = {
  isCandidateArticleUrl,
  generateSearchVariants,
  retrieveWhitelistedFatwas,
};
