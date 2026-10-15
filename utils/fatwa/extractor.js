const { isWhitelistedUrl, getDomainInfo } = require("./whitelist");

function decodeHtmlEntities(str) {
  if (!str) return "";
  return str
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8216;/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&#8211;/g, "-")
    .replace(/&#8212;/g, "--")
    .replace(/&zwnj;/g, "")
    .replace(/&zwj;/g, "")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec));
}

async function fetchArticleHtml(urlStr, timeoutMs = 15000) {
  if (!isWhitelistedUrl(urlStr)) {
    throw new Error(`Security Exception: URL '${urlStr}' is not in whitelisted domains.`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(urlStr, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "bn-BD,bn;q=0.9,ar;q=0.8,en-US;q=0.7,en;q=0.6",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Failed to fetch ${urlStr}`);
    }

    if (response.url && !isWhitelistedUrl(response.url)) {
      throw new Error(`Security Exception: Redirected to non-whitelisted URL '${response.url}'`);
    }

    const html = await response.text();
    return { html, finalUrl: response.url || urlStr };
  } finally {
    clearTimeout(timer);
  }
}

function extractVerbatimReferences(rawText, html = "") {
  const references = new Set();

  const footnoteBlockRegex =
    /<(?:div|section|aside|p|ul|ol)[^>]*(?:class|id)=["'][^"']*(?:reference|footnote|dalil|hawala|source|kitab|masadir)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section|aside|p|ul|ol)>/gi;
  let blockMatch;
  while ((blockMatch = footnoteBlockRegex.exec(html)) !== null) {
    const blockText = blockMatch[1]
      .replace(/<br\s*[\/]?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (blockText.length > 5 && blockText.length < 500) {
      references.add(decodeHtmlEntities(blockText));
    }
  }

  const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);

  const referenceKeywords = [
    "কিতাব", "কিতাবু", "খণ্ড", "খন্ড", "পৃষ্ঠা", "পৃ.", "পৃ-", "হাদীস", "হাদিস",
    "ফাতাওয়া", "ফাতাওয়া", "রদ্দুল মুহতার", "বাদায়েউস সানায়ে", "আল-বাহরুর রায়েক",
    "ফাতাওয়া হিন্দিয়া", "আলমগীরী", "হেদায়া", "হিদায়া", "মুসান্নাফ", "বুখারী",
    "মুসলিম", "তিরমিযী", "আবু দাউদ", "নাসাঈ", "ইবনে মাজাহ", "المراجع", "الردود",
    "حوالہ", "দলিল", "দলীল", "রেফারেন্স", "তথ্যসূত্র", "সূত্র:", "ইমদাদুল ফাতওয়া",
    "ফাতওয়ায়ে মাহমুদিয়া", "ফাতওয়ায়ে হক্কানী", "আহসানুল ফাতওয়া", "আপকি মাসায়িল",
    "জাদিদ ফিক্বহী", "ফাতওয়া উসমানী", "খাইরুল ফাতওয়া", "ফাতওয়া রহিমিয়া", "তাহাবী",
    "মুয়াত্তা", "মুসনাদে আহমাদ", "বায়হাকী", "মারকাযুদ দাওয়াহ"
  ];

  for (const line of lines) {
    const hasCue = referenceKeywords.some((kw) => line.includes(kw));
    const hasVolumeOrPage =
      /(?:খণ্ড|খন্ড|পৃষ্ঠা|পৃ\.|পৃ-|হাদীস|হাদিস|নং|جلد|ص|حديث|\/\d+)\s*[:\-]?\s*[\d০-৯]+/i.test(line);

    const isCitationFormat =
      line.startsWith("-") ||
      line.startsWith("•") ||
      line.startsWith("*") ||
      /^[১-৯\d]+[-–.)]/.test(line);

    if (hasCue && (hasVolumeOrPage || isCitationFormat)) {
      if (line.length >= 8 && line.length <= 350) {
        references.add(line.replace(/^[•\-\*]\s*/, ""));
      }
    }
  }

  const parenRegex =
    /\(([^)\n]*(?:সহীহ|সুনানে|জামে|কিতাব|ফাতাওয়া|ফাতাওয়া|বুখারী|মুসলিম|তিরমিযী|আবু দাউদ|হাদিস|হাদীস|হা\.|পৃষ্ঠা|খণ্ড|পৃ\.|রদ্দুল|হিন্দিয়া|আলমগীরী)[^)\n]*)\)/gi;
  let pMatch;
  while ((pMatch = parenRegex.exec(rawText)) !== null) {
    const citation = pMatch[1].trim();
    if (citation.length >= 8 && citation.length <= 250) {
      references.add(citation);
    }
  }

  return Array.from(references).slice(0, 10);
}

function cleanAndExtractArticle(html, sourceUrl, query = "") {
  const domainInfo = getDomainInfo(sourceUrl);

  let title = "";
  const ogTitleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
  if (ogTitleMatch && ogTitleMatch[1]) {
    title = decodeHtmlEntities(ogTitleMatch[1].trim());
  } else {
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1Match && h1Match[1]) {
      title = decodeHtmlEntities(h1Match[1].replace(/<[^>]+>/g, " ").trim());
    } else {
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        title = decodeHtmlEntities(titleMatch[1].trim());
      }
    }
  }

  title = title
    .replace(/\s*[-–|:]\s*(?:মাসিক আলকাউসার|আহলে হক্ব বাংলা মিডিয়া সার্ভিস|আহলে হক মিডিয়া|ফতোয়াবিডি|Darul Ifta|IslamQA).*$/i, "")
    .trim();

  let contentHtml = "";

  if (sourceUrl.includes("alkawsar.com")) {
    const match = html.match(/<div[^>]*class=["'][^"']*lx-single-post-content[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*(?:<div|<p>&nbsp;<\/p>|\s*<div class="tags")/i);
    if (match) {
      contentHtml = match[1];
    }
  } else if (sourceUrl.includes("ahlehaqmedia.com")) {
    const match = html.match(/<div[^>]*class=["'][^"']*(?:entry-content|entry)[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<!--/i) ||
                  html.match(/<div[^>]*class=["'][^"']*(?:entry-content|entry)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    if (match) {
      contentHtml = match[1];
    }
  } else if (sourceUrl.includes("islamqa.org")) {
    const match = html.match(/<div[^>]*class=["'][^"']*(?:answer|fatwa-content|entry-content)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    if (match) {
      contentHtml = match[1];
    }
  }

  if (!contentHtml) {
    const generalMatch =
      html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
      html.match(/<div[^>]*class=["'][^"']*(?:post-content|main-content|article-content)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    if (generalMatch) {
      contentHtml = generalMatch[1];
    } else {
      contentHtml = html;
    }
  }

  const cleaned = contentHtml
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/<div[^>]*class=["'][^"']*(?:share|social|tags|ad|banner|related)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  const textWithBreaks = cleaned
    .replace(/<br\s*[\/]?>/gi, "\n")
    .replace(/<\/(?:p|h[1-6]|li|div|blockquote)>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ");

  const rawDecoded = decodeHtmlEntities(textWithBreaks);

  const paragraphs = rawDecoded
    .split("\n")
    .map((p) => p.trim())
    .filter((p) => {
      if (!p) return false;
      if (
        p.startsWith("ডাউনলোড করতে") ||
        p.startsWith("Facebook") ||
        p.startsWith("Twitter") ||
        p.startsWith("LinkedIn") ||
        p.startsWith("শেয়ার করুন") ||
        p.includes("Shares")
      ) {
        return false;
      }
      return true;
    });

  const fullCleanText = paragraphs.join("\n\n");

  let targetedText = "";
  if (query && query.trim()) {
    const qTokens = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !["সম্পর্কে", "বিধান", "হুকুম", "কী", "কি", "নিয়ম", "নিয়ে"].includes(w));

    if (qTokens.length > 0) {
      const pList = fullCleanText.split("\n\n");
      const matchedIdx = pList.findIndex((p) => {
        const pLower = p.toLowerCase();
        return qTokens.some((t) => pLower.includes(t));
      });

      if (matchedIdx !== -1) {
        const start = Math.max(0, matchedIdx - 1);
        const end = Math.min(pList.length, matchedIdx + 5);
        targetedText = pList.slice(start, end).join("\n\n");
      }
    }
  }

  const finalContent = (targetedText && targetedText.length > 150)
    ? targetedText
    : fullCleanText.slice(0, 6000);

  const references = extractVerbatimReferences(fullCleanText, cleaned);

  return {
    title: title || "ইসলামিক ফতোয়া ও গবেষণা",
    url: sourceUrl,
    domainInfo,
    content: finalContent,
    fullContent: fullCleanText,
    references,
  };
}

module.exports = {
  decodeHtmlEntities,
  fetchArticleHtml,
  extractVerbatimReferences,
  cleanAndExtractArticle,
};
