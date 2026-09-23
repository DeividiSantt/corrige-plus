import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (request) => {
  const expected = Deno.env.get("CLEANUP_SECRET");
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: files, error } = await supabase
    .from("processing_files")
    .select("id,storage_key,status")
    .lt("expires_at", new Date().toISOString())
    .not("storage_key", "is", null)
    .in("status", ["completed", "failed"]);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let removed = 0;
  for (const file of files || []) {
    const { error: storageError } = await supabase.storage
      .from("answer-sheet-uploads")
      .remove([file.storage_key]);
    if (storageError) continue;
    await supabase
      .from("processing_files")
      .update({
        storage_key: null,
        deleted_at: new Date().toISOString(),
        deletion_reason: "retention_expired",
        final_status_before_deletion: file.status,
        status: "purged",
        purged_at: new Date().toISOString(),
      })
      .eq("id", file.id);
    removed += 1;
  }
  return Response.json({ checked: files?.length || 0, removed });
});
