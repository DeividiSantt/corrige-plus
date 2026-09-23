export const productConfig = {
  name: "CORRIGE+",
  shortName: "CORRIGE+",
  description: "Correção automática de provas com cartões-resposta seguros.",
  supportEmail: "suporte@exemplo.invalid",
  routes: {
    home: "/dashboard",
    login: "/login",
    signup: "/cadastro",
    forgotPassword: "/recuperar-senha",
  },
  limits: {
    maxImageSizeMb: 15,
    supportedQuestionCounts: [10, 20, 30, 40, 50],
    supportedImageTypes: ["image/jpeg", "image/png"],
  },
} as const;

export type ProductConfig = typeof productConfig;
