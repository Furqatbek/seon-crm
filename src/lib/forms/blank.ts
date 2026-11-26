// A new, empty form: Name, Phone and the consent box, in three languages.
// docs/SPEC.md → "Lead forms add-on → Defaults to confirm".

import type { FormDocumentInput } from "./document";

export const BLANK_DOCUMENT: FormDocumentInput = {
  languages: ["uz", "ru", "en"],
  default_language: "uz",
  texts: {
    title: { uz: "Ariza qoldiring", ru: "Оставьте заявку", en: "Leave a request" },
    subtitle: {},
    button: { uz: "Yuborish", ru: "Отправить", en: "Send" },
    thank_you_title: { uz: "Rahmat!", ru: "Спасибо!", en: "Thank you!" },
    thank_you_text: {
      uz: "Arizangiz qabul qilindi. Tez orada siz bilan bogʻlanamiz.",
      ru: "Заявка принята. Мы скоро свяжемся с вами.",
      en: "We have your request and will contact you soon.",
    },
    closed_text: {
      uz: "Bu forma yopilgan. Biz bilan telefon orqali bogʻlaning.",
      ru: "Эта форма закрыта. Свяжитесь с нами по телефону.",
      en: "This form is closed. Please contact us by phone.",
    },
    consent_text: {
      uz: "Maʼlumotlarim men bilan bogʻlanish uchun ishlatilishiga roziman.",
      ru: "Я согласен(на) на использование моих данных для связи со мной.",
      en: "I agree that my details are used to contact me.",
    },
  },
  fields: [
    { id: "name", type: "short_text", maps_to: "name", label: { uz: "Ism va familiya", ru: "Имя и фамилия", en: "Full name" }, required: true },
    {
      id: "phone",
      type: "phone",
      maps_to: "phone",
      label: { uz: "Telefon raqami", ru: "Номер телефона", en: "Phone number" },
      placeholder: { uz: "+998 90 123 45 67", ru: "+998 90 123 45 67", en: "+998 90 123 45 67" },
      required: true,
    },
    { id: "consent", type: "consent", required: true },
  ],
  design: {
    font: "Inter",
    logo: { asset: null, position: "top" },
    background: { color: "#F5F5F7", asset: null, overlay: 0 },
    colors: { text: "#1D1D1F", card: "#FFFFFF", card_text: "#1D1D1F", button: "#F7941D", button_text: "#1D1D1F" },
    corners: "rounded",
    layout: "card",
  },
  after_submit: { mode: "message", url: "" },
  share: { page_title: {}, description: {}, image_asset: null },
};
