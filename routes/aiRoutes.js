const express = require("express");
const { retrieveWhitelistedFatwas } = require("../utils/fatwa/retriever");
const { isWhitelistedUrl, getDomainInfo } = require("../utils/fatwa/whitelist");

const FALLBACK_MESSAGE =
  "দুঃখিত, আমাদের অনুমোদিত ফতোয়া ওয়েবসাইটসমূহে আপনার প্রশ্নের সুনির্দিষ্ট উত্তরটি সরাসরি পাওয়া যায়নি। অনুগ্রহ করে সরাসরি বিজ্ঞ কোনো মুফতি সাহেবের সাথে যোগাযোগ করুন।";

function sanitizeQuery(str) {
  if (!str || typeof str !== "string") return "";
  return str
    .replace(/[<>{}\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractDirectFatwaAnswer(article, query) {
  if (!article || (!article.content && !article.fullContent)) {
    return {
      found: false,
      summary: null,
      detailedExplanation: null,
      references: [],
      sourceTitle: null,
      sourceUrl: null,
      publisher: null,
      fallbackMessage: FALLBACK_MESSAGE,
    };
  }

  const rawText = article.content || article.fullContent;
  const paragraphs = rawText
    .split("\n\n")
    .map((p) => p.trim())
    .filter((p) => p.length > 20);

  let answerParagraphs = [];
  const ansIdx = paragraphs.findIndex((p) =>
    /^(?:উত্তর|জবাব|উত্তরঃ|জবাবঃ|আলজবাব)\b/i.test(p) || p.includes("উত্তর وعليكم") || p.includes("وعليكم السلام")
  );

  if (ansIdx !== -1) {
    answerParagraphs = paragraphs.slice(ansIdx);
  } else {
    answerParagraphs = paragraphs;
  }

  const allSentences = answerParagraphs
    .join(" ")
    .split(/[।!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 15);

  const rulingCues = [
    /জায়েয|জায়েয|ভাঙবে না|ভাঙ্গে না|নষ্ট হবে না|মাকরূহ|ওয়াজিব|ফরজ|সুন্নাত|হারাম|হালাল|অনুমোদিত|মুস্তাহাব|বিদআত নয়|বিদআত নয়|বৈধ|নাজায়েয|নাজায়েয/i,
  ];

  let summary = "";
  for (const sentence of allSentences) {
    if (rulingCues.some((r) => r.test(sentence))) {
      summary = sentence.length > 220 ? sentence.slice(0, 220) + "..." : sentence;
      if (!summary.endsWith("।") && !summary.endsWith("...")) summary += "।";
      break;
    }
  }

  if (!summary) {
    summary = allSentences[0]
      ? allSentences[0] + (allSentences[0].endsWith("।") ? "" : "।")
      : `${article.title} - অনুমোদিত ফতোয়া পোর্টাল থেকে সংগৃহীত।`;
  }

  const cleanAnswerParagraphs = answerParagraphs.filter((p) => {
    if (/^প্রশ্ন\s*:/i.test(p) && p.length < 100) return false;
    return true;
  });

  const detailedExplanation =
    cleanAnswerParagraphs.slice(0, 5).join("\n\n") || rawText.slice(0, 1000);

  const references = Array.isArray(article.references) ? article.references : [];

  return {
    found: true,
    summary,
    detailedExplanation,
    references,
    sourceTitle: article.title,
    sourceUrl: article.url,
    publisher: article.domainInfo?.name || "অনুমোদিত ইসলামিক পোর্টাল",
    fallbackMessage: null,
  };
}

async function callGeminiFormatter(apiKey, userQuery, sourceArticle) {
  const models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
  const prompt = `তুমি "আল-মদিনা ইসলামিক একাডেমি" এর "ফাতওয়া জিজ্ঞাসা" সহকারী।
নিচে একটি অনুমোদিত ফতোয়া ওয়েবসাইট থেকে হুবহু সংগৃহীত পাঠ দেওয়া হলো:

[উৎস শিরোনাম]: ${sourceArticle.title}
[উৎস পাঠ]:
${sourceArticle.content.slice(0, 3500)}

[ব্যবহারকারীর প্রশ্ন]: ${userQuery}

উৎস পাঠে থাকা তথ্যের ভিত্তিতে ভ্যালিড JSON প্রদান কর:
{
  "summary": "উৎস থেকে সরাসরি মূল ফতোয়া বা হুকুম",
  "detailedExplanation": "উৎস থেকে বিস্তারিত আলোচনা ও দলীলসমূহ",
  "references": ${JSON.stringify(sourceArticle.references || [])}
}`;

  for (const model of models) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const payload = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.0,
          responseMimeType: "application/json",
        },
      };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) continue;

      const data = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) continue;

      const cleaned = rawText
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      const parsed = JSON.parse(cleaned);
      if (parsed.summary && parsed.detailedExplanation) {
        return {
          found: true,
          summary: parsed.summary,
          detailedExplanation: parsed.detailedExplanation,
          references: Array.isArray(parsed.references) && parsed.references.length > 0
            ? parsed.references
            : sourceArticle.references || [],
          sourceTitle: sourceArticle.title,
          sourceUrl: sourceArticle.url,
          publisher: sourceArticle.domainInfo?.name || "অনুমোদিত ইসলামিক পোর্টাল",
          fallbackMessage: null,
        };
      }
    } catch (_) {}
  }
  return null;
}

function aiRoutes() {
  const router = express.Router();

  /**
   * POST /api/chat
   * AI Chatbot for General Madrasah inquiries
   */
  router.post("/api/chat", async (req, res) => {
    try {
      const { messages } = req.body || {};
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ role: "assistant", content: "কোনো বার্তা পাওয়া যায়নি।" });
      }

      const userMessage = messages[messages.length - 1].content;

      const madrasahContext = `
      তুমি হলে "আল-মদিনা ইসলামিক একাডেমি (AL-MADINA ISLAMIC ACADEMY), ব্রাহ্মণবাড়িয়া" এর কৃত্রিম বুদ্ধিমত্তা সহকারী। ভিজিটরদের মাদরাসা সম্পর্কিত প্রশ্নের সঠিক ও বিস্তারিত তথ্য দেওয়াই তোমার কাজ।

মাদরাসার তথ্য ভাণ্ডার (Knowledge Base):
১. প্রতিষ্ঠান পরিচিতি:
- নাম: আল-মদিনা ইসলামিক একাডেমি (AL-MADINA ISLAMIC ACADEMY)
- আরবি নাম: أكاديمية المدينة الإسلامية
- স্থাপিত: ২০২৫
- ঠিকানা: বড় বাকাইল, সুহিলপুর, সদর, ব্রাহ্মণবাড়িয়া, বাংলাদেশ।
- মোবাইল: +880 1748-868161
- বৈশিষ্ট্য: ইসলামিক শিক্ষা ও সাধারণ শিক্ষার এক অপূর্ব সমন্বয়। সিসিটিভি ক্যামেরা সমৃদ্ধ ক্লাসরুম, ওয়ান-ক্লিক আইডি কার্ড জেনারেটর, ডিজিটাল এডমিট কার্ড, অনলাইন রেজাল্ট সার্চ ও সীট প্ল্যান।

২. শিক্ষা কার্যক্রম ও বিভাগসমূহ:
- প্রি-হিফজ বিভাগ: কায়দা/আমপারা, নাজেরা।
- হিফজ বিভাগ: সবক, শুনানি।
- একাডেমিক বিভাগ: 
  * প্রাক-প্রাথমিক (প্লে, নার্সারি)
  * প্রাথমিক (১ম থেকে ৫ম শ্রেণি)
  * মাধ্যমিক (৬ষ্ঠ থেকে ১০ম শ্রেণি)
 
- ডিজিটাল এডটেক (EdTech) সুবিধা: লাইভ ক্লাস, রেকর্ডেড ক্লাস, অনলাইন এক্সাম ও কুইজ, ই-বুক ও লেকচার শিট।
- সহ-পাঠ্যক্রম: ক্বিরাত, হামদ-নাত, বক্তৃতা ও বিতর্ক প্রশিক্ষণ, শারীরিক ব্যায়াম ও খেলাধুলা।

৩. ভর্তি তথ্য (Admission):
- ভর্তির সময়কাল: ২০২৬ শিক্ষাবর্ষে হিফজ ও একাডেমিক বিভাগে ভর্তি চলছে। আসন সংখ্যা অত্যন্ত সীমিত।
- ভর্তি প্রক্রিয়া: ভর্তি পরীক্ষার মাধ্যমে মেধা মূল্যায়ন করে ভর্তি নেওয়া হয়। অনলাইন ভর্তি ফরম সাইট থেকেই পূরণ করা যায়।
- ফি ক্যাটাগরি: সাধারণ (General), এতিম ফান্ড (Orphan), গরিব ফান্ড (Poor Fund), স্কলারশিপ (Scholarship), শিক্ষক/স্টাফ সন্তান (Staff Child)।

৪. আবাসন ব্যবস্থা (Hostel):
- ছাত্রদের মননশীল ও নৈতিক বিকাশে আধুনিক ও সুশৃঙ্খল ছাত্রাবাস ব্যবস্থা রয়েছে।
- আবাসিক হলের যোগ্য পরিচালকবৃন্দ, পুষ্টিকর খাবার এবং সার্বক্ষণিক নিরাপত্তা নিশ্চিত করা হয়।

৫. পরীক্ষা ও রুটিন:
- দ্বিতীয় সাময়িক পরীক্ষা আগামী ২৩ আগস্ট থেকে শুরু হতে যাচ্ছে।
- শ্রেণি-ভিত্তিক পরীক্ষার রুটিন পোর্টালে পাওয়া যায় এবং প্রিন্ট করা যায়।

নির্দেশনা:
- সবসময় অত্যন্ত নম্র ও ইসলামিক অভিবাদন (আস-সালামু আলাইকুম) দিয়ে কথা বলা শুরু করবে।
- উত্তর বাংলায় দেবে। তথ্যপূর্ণ কিন্তু স্পষ্ট ও প্রাসঙ্গিক কথা বলবে।
- যদি কোনো তথ্যের উত্তর জানা না থাকে তবে বানিয়ে বলবে না, বরং মাদরাসার যোগাযোগের নম্বরে (+৮৮০১২৩৪৫৬৭৮৯০) বা ইমেইলে যোগাযোগ করতে বলবে।
- রাজনৈতিক বা মাদরাসার বহির্ভূত কোনো অপ্রাসঙ্গিক প্রশ্নের উত্তর দেবে না।
- উত্তর সংক্ষিপ্ত ও ইউজার যে ভাষায় কথা বলবে সেই ভাষায় দেবে। "ইসলামিক অভিবাদন (আস-সালামু আলাইকুম)" প্রথমবার রিপ্লাই দেয়ার পর বলবেন। পরের সকল রিপ্লাইয়ে আর "আস-সালামু আলাইকুম" বলবেন না।
    `;

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(200).json({
          role: "assistant",
          content: "দুঃখিত, এপিআই কি (API Key) কনফিগার করা হয়নি।",
        });
      }

      let response;
      let data;
      let retries = 3;
      let delay = 2000;

      while (retries > 0) {
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  role: "user",
                  parts: [{ text: `${madrasahContext}\n\nUser Question: ${userMessage}` }],
                },
              ],
            }),
          }
        );

        data = await response.json();

        if (response.status === 429 || response.status === 503 || data.error?.code === 429) {
          retries--;
          if (retries > 0) {
            console.warn(`Gemini busy. Retrying in ${delay / 1000}s... Retries left: ${retries}`);
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
        }

        break;
      }

      if (data && data.error) {
        console.error("Gemini API Error after retries:", data.error);
        return res.status(200).json({
          role: "assistant",
          content: "গুগল সার্ভারে এই মুহূর্তে অতিরিক্ত ট্রাফিক রয়েছে। অনুগ্রহ করে কয়েক সেকেন্ড পর আবার মেসেজ দিন।",
        });
      }

      const botReply =
        data?.candidates?.[0]?.content?.parts?.[0]?.text ||
        "দুঃখিত, আমি এই মুহূর্তে উত্তরটি দিতে পারছি না। অনুগ্রহ করে আবার চেষ্টা করুন।";

      res.status(200).json({
        role: "assistant",
        content: botReply,
      });
    } catch (error) {
      console.error("Chat API Error:", error);
      res.status(500).json({
        role: "assistant",
        content: "সার্ভারে সমস্যা হয়েছে। অনুগ্রহ করে কিছুক্ষণ পর চেষ্টা করুন।",
      });
    }
  });

  /**
   * POST /api/fatwa-assistant
   * Verified Fatwa Query Answering
   */
  router.post("/api/fatwa-assistant", async (req, res) => {
    try {
      const rawQuery = req.body?.query;
      const cleanQuery = sanitizeQuery(rawQuery);

      if (!cleanQuery || cleanQuery.length < 2) {
        return res.status(400).json({
          success: false,
          error: "অনুগ্রহ করে আপনার প্রশ্নটি পরিষ্কারভাবে লিখুন (কমপক্ষে ৩ অক্ষর)।",
        });
      }

      if (cleanQuery.length > 300) {
        return res.status(400).json({
          success: false,
          error: "প্রশ্নটি খুব দীর্ঘ। অনুগ্রহ করে ৩০০ অক্ষরের মধ্যে সংক্ষেপে লিখুন।",
        });
      }

      const retrievedArticles = await retrieveWhitelistedFatwas(cleanQuery, 3);

      if (!retrievedArticles || retrievedArticles.length === 0) {
        return res.status(200).json({
          success: true,
          data: {
            found: false,
            summary: null,
            detailedExplanation: null,
            references: [],
            sourceTitle: null,
            sourceUrl: null,
            publisher: null,
            fallbackMessage: FALLBACK_MESSAGE,
          },
        });
      }

      let topArticle = retrievedArticles[0];
      const qTokens = cleanQuery.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
      if (retrievedArticles.length > 1 && qTokens.length > 0) {
        let maxMatches = -1;
        for (const art of retrievedArticles) {
          const text = (art.title + " " + (art.content || "")).toLowerCase();
          let matches = 0;
          for (const t of qTokens) {
            if (text.includes(t)) matches += 2;
          }
          if (art.title && qTokens.some((t) => art.title.toLowerCase().includes(t))) {
            matches += 3;
          }
          if (matches > maxMatches) {
            maxMatches = matches;
            topArticle = art;
          }
        }
      }

      let finalAnswer = null;
      const geminiKey = process.env.GEMINI_API_KEY;
      if (geminiKey) {
        finalAnswer = await callGeminiFormatter(geminiKey, cleanQuery, topArticle);
      }

      if (!finalAnswer) {
        finalAnswer = extractDirectFatwaAnswer(topArticle, cleanQuery);
      }

      if (finalAnswer.sourceUrl && !isWhitelistedUrl(finalAnswer.sourceUrl)) {
        finalAnswer.sourceUrl = topArticle.url;
        finalAnswer.sourceTitle = topArticle.title;
        finalAnswer.publisher = topArticle.domainInfo?.name;
      }

      res.status(200).json({
        success: true,
        data: {
          found: true,
          summary: finalAnswer.summary || "",
          detailedExplanation: finalAnswer.detailedExplanation || "",
          references: Array.isArray(finalAnswer.references) ? finalAnswer.references : [],
          sourceTitle: finalAnswer.sourceTitle || topArticle.title,
          sourceUrl: finalAnswer.sourceUrl || topArticle.url,
          publisher:
            finalAnswer.publisher ||
            topArticle.domainInfo?.name ||
            "অনুমোদিত ইসলামিক পোর্টাল",
          fallbackMessage: null,
        },
      });
    } catch (error) {
      console.error("Fatwa Assistant Route Error:", error);
      res.status(500).json({
        success: false,
        error: "সার্ভারে প্রক্রিয়া করতে সমস্যা হচ্ছে। অনুগ্রহ করে একটু পর আবার চেষ্টা করুন।",
      });
    }
  });

  return router;
}

module.exports = aiRoutes;
