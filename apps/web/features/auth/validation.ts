import { z } from "zod";

export const emailSchema = z
  .email("Informe um e-mail válido.")
  .transform((value) => value.toLowerCase());

export const passwordSchema = z
  .string()
  .min(8, "Use pelo menos 8 caracteres.")
  .regex(/[A-Za-z]/, "Inclua pelo menos uma letra.")
  .regex(/[0-9]/, "Inclua pelo menos um número.");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Informe sua senha."),
  next: z.string().optional(),
});

export const signupSchema = z
  .object({
    fullName: z.string().trim().min(2, "Informe seu nome completo.").max(160),
    organizationName: z.string().trim().min(2, "Informe o nome da instituição.").max(160),
    email: emailSchema,
    password: passwordSchema,
    passwordConfirmation: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    message: "As senhas precisam ser iguais.",
    path: ["passwordConfirmation"],
  });

export const recoverSchema = z.object({ email: emailSchema });
export const resendSchema = z.object({ email: emailSchema });

export const updatePasswordSchema = z
  .object({
    password: passwordSchema,
    passwordConfirmation: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    message: "As senhas precisam ser iguais.",
    path: ["passwordConfirmation"],
  });
