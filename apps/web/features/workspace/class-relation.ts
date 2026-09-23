type ClassRelation = { name?: unknown } | { name?: unknown }[] | null | undefined;

/**
 * O Supabase pode retornar relações muitos-para-um como objeto ou como lista,
 * conforme a inferência da consulta. A interface deve exibir a turma nos dois casos.
 */
export function classNameFromRelation(relation: ClassRelation) {
  const row = Array.isArray(relation) ? relation[0] : relation;
  return typeof row?.name === "string" && row.name.trim() ? row.name : "Turma não informada";
}
