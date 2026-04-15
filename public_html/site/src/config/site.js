/** Site-wide links and contact (single source of truth) */
export const site = {
  name: "TechonERP",
  tagline: "by Techon Computers",
  url: "https://www.erp.techon.lk",
  email: "info@techon.lk",
  mailto: "mailto:info@techon.lk",
  phoneDisplay1: "+94 70 1234 678",
  phoneDisplay2: "+94 70 1234 178",
  tel1: "tel:+94701234678",
  tel2: "tel:+94701234178",
  whatsapp: "https://wa.me/94701234678",
  whatsappPrefill: (text) =>
    `https://wa.me/94701234678?text=${encodeURIComponent(text)}`,
};
