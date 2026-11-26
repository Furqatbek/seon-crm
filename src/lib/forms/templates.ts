// The three starting forms — docs/SPEC.md → "Lead forms add-on → Form builder".
// They are also seeded and published by a migration, so they can be opened
// before the editor exists.

import type { FormDocumentInput, Localized } from "./document";

export type FormTemplate = {
  key: string;
  name: string;
  slug: string;
  subject: string | null;
  source_tag: string;
  document: FormDocumentInput;
};

const NAME = { uz: "Ism va familiya", ru: "Имя и фамилия", en: "Full name" };
const PHONE = { uz: "Telefon raqami", ru: "Номер телефона", en: "Phone number" };
const CONSENT: Localized = {
  uz: "Maʼlumotlarim men bilan bogʻlanish uchun ishlatilishiga roziman.",
  ru: "Я согласен(на) на использование моих данных для связи со мной.",
  en: "I agree that my details are used to contact me.",
};
const CLOSED: Localized = {
  uz: "Bu forma yopilgan. Biz bilan telefon orqali bogʻlaning.",
  ru: "Эта форма закрыта. Свяжитесь с нами по телефону.",
  en: "This form is closed. Please contact us by phone.",
};
const THANKS: Localized = { uz: "Rahmat!", ru: "Спасибо!", en: "Thank you!" };
const CALL_BACK: Localized = {
  uz: "Arizangiz qabul qilindi. Tez orada siz bilan bogʻlanamiz.",
  ru: "Заявка принята. Мы скоро свяжемся с вами.",
  en: "We have your request and will contact you soon.",
};

const nameField = { id: "name", type: "short_text", maps_to: "name", label: NAME, required: true, width: "half" } as const;
const phoneField = {
  id: "phone",
  type: "phone",
  maps_to: "phone",
  label: PHONE,
  placeholder: { uz: "+998 90 123 45 67", ru: "+998 90 123 45 67", en: "+998 90 123 45 67" },
  required: true,
  width: "half",
} as const;
const consentField = { id: "consent", type: "consent", required: true } as const;

const TIMES = [
  { id: "morning", label: { uz: "Ertalab", ru: "Утром", en: "Morning" } },
  { id: "afternoon", label: { uz: "Kunduzi", ru: "Днём", en: "Afternoon" } },
  { id: "evening", label: { uz: "Kechqurun", ru: "Вечером", en: "Evening" } },
];

const base: Pick<FormDocumentInput, "languages" | "default_language"> = { languages: ["uz", "ru", "en"], default_language: "uz" };
const share = { page_title: {}, description: {}, image_asset: null };

export const FORM_TEMPLATES: FormTemplate[] = [
  {
    key: "course_signup",
    name: "Course sign-up",
    slug: "course-signup",
    subject: null,
    source_tag: "course-signup",
    document: {
      ...base,
      texts: {
        title: { uz: "Kursga yozilish", ru: "Запись на курс", en: "Sign up for a course" },
        subtitle: {
          uz: "Formani toʻldiring — sizga mos guruhni tanlab, qoʻngʻiroq qilamiz.",
          ru: "Заполните форму — подберём группу и перезвоним.",
          en: "Fill in the form and we will call you with a group that fits.",
        },
        button: { uz: "Yozilish", ru: "Записаться", en: "Sign up" },
        thank_you_title: THANKS,
        thank_you_text: CALL_BACK,
        closed_text: CLOSED,
        consent_text: CONSENT,
      },
      fields: [
        nameField,
        phoneField,
        {
          id: "level",
          type: "radio",
          label: { uz: "Hozirgi darajangiz", ru: "Ваш уровень сейчас", en: "Your level now" },
          required: true,
          options: [
            { id: "beginner", label: { uz: "Noldan boshlayman", ru: "Начинаю с нуля", en: "Starting from zero" } },
            { id: "basic", label: { uz: "Boshlangʻich", ru: "Начальный", en: "Basic" } },
            { id: "intermediate", label: { uz: "Oʻrta", ru: "Средний", en: "Intermediate" } },
            { id: "advanced", label: { uz: "Yuqori", ru: "Продвинутый", en: "Advanced" } },
          ],
        },
        {
          id: "time",
          type: "dropdown",
          maps_to: "preferred_time",
          label: { uz: "Qulay vaqt", ru: "Удобное время", en: "Preferred time" },
          options: TIMES,
        },
        {
          id: "comment",
          type: "long_text",
          maps_to: "notes",
          label: { uz: "Izoh", ru: "Комментарий", en: "Comment" },
          placeholder: { uz: "Savolingiz boʻlsa, yozing", ru: "Если есть вопрос, напишите", en: "Any questions? Write them here" },
        },
        consentField,
      ],
      design: {
        font: "Inter",
        logo: { asset: null, position: "top" },
        background: { color: "#FFF4E5", asset: null, overlay: 0 },
        colors: { text: "#1D1D1F", card: "#FFFFFF", card_text: "#1D1D1F", button: "#F7941D", button_text: "#1D1D1F" },
        corners: "rounded",
        layout: "card",
      },
      after_submit: { mode: "message", url: "" },
      share,
    },
  },
  {
    key: "free_trial",
    name: "Free trial lesson",
    slug: "free-trial",
    subject: null,
    source_tag: "free-trial",
    document: {
      ...base,
      texts: {
        title: { uz: "Bepul sinov darsi", ru: "Бесплатный пробный урок", en: "Free trial lesson" },
        subtitle: {
          uz: "Bir darsga keling: oʻqituvchi bilan tanishing va darajangizni bilib oling.",
          ru: "Приходите на один урок: познакомьтесь с преподавателем и узнайте свой уровень.",
          en: "Come to one lesson: meet the teacher and find out your level.",
        },
        button: { uz: "Sinov darsiga yozilish", ru: "Записаться на пробный урок", en: "Book a trial lesson" },
        thank_you_title: THANKS,
        thank_you_text: {
          uz: "Sinov darsi vaqtini kelishish uchun sizga qoʻngʻiroq qilamiz.",
          ru: "Мы позвоним, чтобы согласовать время пробного урока.",
          en: "We will call you to agree a time for the trial lesson.",
        },
        closed_text: CLOSED,
        consent_text: CONSENT,
      },
      fields: [
        nameField,
        phoneField,
        {
          id: "age",
          type: "number",
          label: { uz: "Yoshingiz", ru: "Ваш возраст", en: "Your age" },
          width: "half",
        },
        {
          id: "day",
          type: "date",
          label: { uz: "Qaysi kuni kela olasiz?", ru: "В какой день сможете прийти?", en: "Which day can you come?" },
          width: "half",
        },
        {
          id: "time",
          type: "radio",
          maps_to: "preferred_time",
          label: { uz: "Qulay vaqt", ru: "Удобное время", en: "Preferred time" },
          required: true,
          options: TIMES,
        },
        consentField,
      ],
      design: {
        font: "Manrope",
        logo: { asset: null, position: "left" },
        background: { color: "#1D1D1F", asset: null, overlay: 0 },
        colors: { text: "#FFFFFF", card: "#FFFFFF", card_text: "#1D1D1F", button: "#F7941D", button_text: "#1D1D1F" },
        corners: "pill",
        layout: "split",
      },
      after_submit: { mode: "message", url: "" },
      share,
    },
  },
  {
    key: "consultation",
    name: "Consultation call",
    slug: "consultation",
    subject: null,
    source_tag: "consultation",
    document: {
      ...base,
      texts: {
        title: { uz: "Bepul maslahat", ru: "Бесплатная консультация", en: "Free consultation" },
        subtitle: {
          uz: "Raqamingizni qoldiring — menejerimiz qoʻngʻiroq qilib, barcha savollarga javob beradi.",
          ru: "Оставьте номер — менеджер перезвонит и ответит на все вопросы.",
          en: "Leave your number and our manager will call to answer every question.",
        },
        button: { uz: "Qoʻngʻiroq buyurtma qilish", ru: "Заказать звонок", en: "Request a call" },
        thank_you_title: THANKS,
        thank_you_text: CALL_BACK,
        closed_text: CLOSED,
        consent_text: CONSENT,
      },
      fields: [
        { ...nameField, width: "full" },
        { ...phoneField, width: "full" },
        {
          id: "topics",
          type: "multiple_choice",
          label: { uz: "Sizni nima qiziqtiradi?", ru: "Что вас интересует?", en: "What are you interested in?" },
          options: [
            { id: "courses", label: { uz: "Kurslar va narxlar", ru: "Курсы и цены", en: "Courses and prices" } },
            { id: "schedule", label: { uz: "Dars jadvali", ru: "Расписание", en: "Timetable" } },
            { id: "exam", label: { uz: "Imtihonga tayyorlov", ru: "Подготовка к экзамену", en: "Exam preparation" } },
          ],
        },
        {
          id: "time",
          type: "dropdown",
          maps_to: "preferred_time",
          label: { uz: "Qachon qoʻngʻiroq qilaylik?", ru: "Когда вам позвонить?", en: "When should we call?" },
          options: TIMES,
        },
        consentField,
      ],
      design: {
        font: "Montserrat",
        logo: { asset: null, position: "top" },
        background: { color: "#F5F5F7", asset: null, overlay: 0 },
        colors: { text: "#1D1D1F", card: "#FFFFFF", card_text: "#1D1D1F", button: "#1D1D1F", button_text: "#FFFFFF" },
        corners: "square",
        layout: "card",
      },
      after_submit: { mode: "message", url: "" },
      share,
    },
  },
];
