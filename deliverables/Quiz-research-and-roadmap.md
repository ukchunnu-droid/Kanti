# Kanti — why the quiz is short, and where the site goes next

Notes for the final presentation and portfolio, written in response to Professor Spencer's feedback (Nov 2026).

## 1. Why the quiz is 7 questions

**What the research says**

- **Every extra question costs completions, and the early ones cost the most.** SurveyMonkey analysed 100,000 surveys of 1–50 questions. Drop-off rises with length, and the sharpest increase per added question comes in the first 15 questions. ([SurveyMonkey: survey questions and completion rates](https://www.surveymonkey.com/curiosity/survey_questions_and_completion_rates/))
- **Shorter surveys finish more often.** SurveyMonkey's own averages show 89% completion for 10-question surveys, falling to 79% at 40 questions. Rating-grid questions lower completion further, and so does each additional word in a question. ([SurveyMonkey: tips for increasing completion rates](https://www.surveymonkey.com/curiosity/tips-increasing-survey-completion-rates/))
- **Short is the norm.** Across 26,000+ surveys, the median length was 12 questions. ([SurveyMonkey: half of surveys are short](https://www.surveymonkey.com/curiosity/half-of-surveymonkey-surveys-are-short-why-yours-should-be-too/))
- **Product quizzes need a balance.**
  - Octane AI, a product-quiz platform, reports that 60–70% of visitors complete an interactive quiz on average, and the best quizzes reach about 90%.
  - It warns that a 25-question quiz gets heavy drop-off, but that shoppers won't trust a result from a quiz that asks just one question.
  - ([Octane AI: how to audit and optimise your product quiz](https://octaneai.com/blog/how-to-audit-and-optimize-your-product-quiz))
- **Drop-off compounds step by step.** If each step of a 6-step quiz keeps only 70% of people, just 12% of starters reach the result page. ([ConvertFlow: fixing quiz funnel drop-off](https://www.convertflow.com/blog/how-to-fix-ecommerce-quiz-funnel-drop-off-in-2026))

*Caveat:* the product-quiz benchmarks come from companies that sell quiz tools, so treat them as direction rather than independent proof. The SurveyMonkey figures are first-party data from a very large sample, but they are from 2009–2016.

**How Kanti applies it**

| Research finding | Kanti design decision |
|---|---|
| Drop-off is steepest in the first ~15 questions | **7 questions** in total, about a minute |
| A quiz that's too short isn't trusted | 5 questions do the real work: 2 on skin type, 2 on dosha and 1 on your goal |
| Long wording and rating grids lower completion | One short question per screen, with tappable answers and no grids |
| Every step loses people | A progress bar, a Back button, and answers saved if you leave and come back |
| People don't fit neat boxes | "All of the above" and "Other (your own words)" on every question; the culture question is "pick all that apply" |
| Keep it engaging | 2 light questions (culture, spice) power the "a little about you" fun fact |

**Measure it:** the admin **Analytics** tab shows the real funnel: started quiz → finished quiz → saw routine → added to bag → checkout → ordered. Use these numbers to show the completion rate in the presentation.

## 2. Roadmap: future goals

**Next (after launch)**
1. **Deeper "Refine my routine" quiz for customers.** Once someone has bought and used their routine for 2–3 weeks, offer an optional 8–10 question follow-up. It would ask how each product feels, about sensitivity and reactions, climate and season, lifestyle (sleep, stress, water) and their budget. The answers fine-tune the recommendations. It stays out of the first-visit quiz so the entry point stays short.
2. **Payments**, through a hosted checkout such as Stripe.
3. **Sign in with Google or Apple.**

**Later**

4. **Seasonal routine switches (ritucharya):** suggest product swaps automatically when the season changes.
5. **Before/after tracking:** link the skin diary to optional progress photos, kept private to the customer.
6. **Real product pages from live web search** in "Beyond Kanti", once the AI plan includes Google Search.
7. **More languages** (full Hindi, then Tamil and Bengali), and a mobile app (PWA).
8. **A real domain** (e.g. kanti.com) with a transactional email provider.

## 3. Other feedback addressed

- **Culture question** is now "pick all that apply". It doesn't affect the skin result, so there's no reason to force one answer.
- **Before/after face:** redrawn so the face fills the hair outline and the neck sits inside the jawline, on all five skin tones.
- **Chatbot persona:** "Ask Kanti" is now **Ask Amu**, Kanti's peacock guide.
  - The peacock is India's national bird.
  - "Amu" is Uma backwards, so the founder's name is in the mascot.
  - Amu has its own avatar, says a one-time hello to new visitors, and the AI answers in Amu's voice.
