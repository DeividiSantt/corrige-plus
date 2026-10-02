"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import {
  CameraIcon,
  CheckCircleIcon,
  ImageIcon,
  TrashIcon,
  UploadSimpleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import {
  ACCEPTED_IMAGE_EXTENSIONS,
  ACCEPTED_IMAGE_TYPES,
  ANSWER_SHEET_BUCKET,
  formatFileSize,
  MAX_FILES_PER_BATCH,
  MAX_FILE_SIZE_BYTES,
  MIN_IMAGE_HEIGHT,
  MIN_IMAGE_WIDTH,
} from "./config";

type ExamOption = {
  id: string;
  classes: { id: string; name: string }[];
  title: string;
  subject: string;
  questions: number;
};

type SelectedFile = {
  id: string;
  file: File;
  preview: string;
  error?: string;
  status: "ready" | "uploading" | "uploaded" | "processing" | "processed" | "failed";
};

// O leitor de cartões executa visão computacional e pode levar alguns segundos
// por foto. Limitar a fila evita que um lote grande deixe requisições paradas
// por tempo suficiente para atingir o timeout do serviço.
const MAX_CONCURRENT_CORRECTIONS = 1;

async function imageDimensions(file: File) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      reject(new Error("O arquivo não é uma imagem válida."));
      URL.revokeObjectURL(url);
    };
    image.src = url;
  });
}

async function validateFile(file: File) {
  if (!file.size) return "O arquivo está vazio.";
  const extension = `.${file.name.split(".").pop()?.toLowerCase()}`;
  if (
    !ACCEPTED_IMAGE_TYPES.includes(file.type as (typeof ACCEPTED_IMAGE_TYPES)[number]) ||
    !ACCEPTED_IMAGE_EXTENSIONS.includes(extension as (typeof ACCEPTED_IMAGE_EXTENSIONS)[number])
  ) {
    return "O arquivo não é uma imagem JPG ou PNG válida.";
  }
  if (file.size > MAX_FILE_SIZE_BYTES) return "Esta imagem ultrapassa o limite de 12 MB.";
  try {
    const dimensions = await imageDimensions(file);
    if (dimensions.width < MIN_IMAGE_WIDTH || dimensions.height < MIN_IMAGE_HEIGHT) {
      return `A resolução é muito baixa. Use pelo menos ${MIN_IMAGE_WIDTH} × ${MIN_IMAGE_HEIGHT} px.`;
    }
  } catch (error) {
    return error instanceof Error ? error.message : "O arquivo não é uma imagem válida.";
  }
}

export function UploadPanel({
  organizationId,
  userId,
  exams,
  initialExamId,
}: {
  organizationId: string;
  userId: string;
  exams: ExamOption[];
  initialExamId?: string;
}) {
  const [examId, setExamId] = useState(initialExamId || "");
  const [classId, setClassId] = useState(() => {
    const initialExam = exams.find((item) => item.id === initialExamId);
    return initialExam?.classes.length === 1 ? initialExam.classes[0].id : "";
  });
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const exam = exams.find((item) => item.id === examId);
  const selectedClass = exam?.classes.find((item) => item.id === classId);
  const validFiles = useMemo(() => files.filter((item) => !item.error), [files]);

  async function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list);
    if (files.length + incoming.length > MAX_FILES_PER_BATCH) {
      setMessage(`Você pode enviar no máximo ${MAX_FILES_PER_BATCH} imagens por lote.`);
      return;
    }
    const existingNames = new Set(files.map((item) => item.file.name.toLowerCase()));
    const additions: SelectedFile[] = [];
    for (const file of incoming) {
      const duplicate = existingNames.has(file.name.toLowerCase());
      const error = duplicate ? "Já existe um arquivo com este nome no lote." : await validateFile(file);
      existingNames.add(file.name.toLowerCase());
      additions.push({
        id: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
        error,
        status: "ready",
      });
    }
    setFiles((current) => [...current, ...additions]);
    setMessage("");
  }

  function removeFile(id: string) {
    setFiles((current) => {
      const target = current.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.preview);
      return current.filter((item) => item.id !== id);
    });
  }

  async function upload() {
    if (!exam || !selectedClass || !validFiles.length) return;
    setSubmitting(true);
    setMessage("");
    const supabase = createClient();
    const { data: batch, error: batchError } = await supabase
      .from("processing_batches")
      .insert({
        organization_id: organizationId,
        exam_id: exam.id,
        class_id: selectedClass.id,
        created_by: userId,
        status: "waiting",
        total_files: validFiles.length,
        queued_files: validFiles.length,
      })
      .select("id")
      .single();
    if (batchError || !batch) {
      setMessage(batchError?.message || "Não foi possível criar o lote.");
      setSubmitting(false);
      return;
    }

    let failures = 0;
    const dispatchQueue: { selectedId: string; processingFileId: string }[] = [];
    for (const selected of validFiles) {
      setFiles((current) =>
        current.map((item) => (item.id === selected.id ? { ...item, status: "uploading" } : item)),
      );
      const digest = await crypto.subtle.digest("SHA-256", await selected.file.arrayBuffer());
      const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      const { data: record, error: recordError } = await supabase
        .from("processing_files")
        .insert({
          batch_id: batch.id,
          file_name: selected.file.name,
          file_hash: hash,
          status: "waiting",
        })
        .select("id")
        .single();
      if (recordError || !record) {
        failures += 1;
        setFiles((current) =>
          current.map((item) =>
            item.id === selected.id
              ? { ...item, status: "failed", error: recordError?.message || "Falha ao registrar o arquivo." }
              : item,
          ),
        );
        continue;
      }
      const extension = selected.file.name.split(".").pop()?.toLowerCase() === "png" ? "png" : "jpg";
      const storageKey = `${organizationId}/${userId}/${exam.id}/${batch.id}/${record.id}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from(ANSWER_SHEET_BUCKET)
        .upload(storageKey, selected.file, { contentType: selected.file.type, upsert: false });
      if (uploadError) {
        failures += 1;
        await supabase
          .from("processing_files")
          .update({ status: "failed", error_code: "UPLOAD_FAILED", error_message: uploadError.message })
          .eq("id", record.id);
        setFiles((current) =>
          current.map((item) =>
            item.id === selected.id ? { ...item, status: "failed", error: "Falha ao enviar. Tente novamente." } : item,
          ),
        );
        continue;
      }
      await supabase.from("processing_files").update({ storage_key: storageKey, status: "waiting" }).eq("id", record.id);
      setFiles((current) =>
        current.map((item) => (item.id === selected.id ? { ...item, status: "uploaded" } : item)),
      );
      dispatchQueue.push({ selectedId: selected.id, processingFileId: record.id });
    }
    const dispatchResults: boolean[] = [];
    let nextDispatchIndex = 0;
    async function dispatchOne({ selectedId, processingFileId }: { selectedId: string; processingFileId: string }) {
        setFiles((current) =>
          current.map((item) => (item.id === selectedId ? { ...item, status: "processing" } : item)),
        );
        try {
          const response = await fetch("/api/correction/dispatch", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ processingFileId, reprocess: false }),
          });
          const body = await response.json().catch(() => null);
          if (!response.ok) {
            throw new Error(body?.error || "O processamento não foi aceito.");
          }
          setFiles((current) =>
            current.map((item) => (item.id === selectedId ? { ...item, status: "processed" } : item)),
          );
          return true;
        } catch (error) {
          const message = error instanceof Error ? error.message : "O processamento não foi aceito.";
          setFiles((current) =>
            current.map((item) =>
              item.id === selectedId ? { ...item, status: "failed", error: message } : item,
            ),
          );
          return false;
        }
    }
    async function dispatchWorker() {
      while (nextDispatchIndex < dispatchQueue.length) {
        const currentIndex = nextDispatchIndex;
        nextDispatchIndex += 1;
        dispatchResults[currentIndex] = await dispatchOne(dispatchQueue[currentIndex]);
      }
    }
    await Promise.all(
      Array.from(
        { length: Math.min(MAX_CONCURRENT_CORRECTIONS, dispatchQueue.length) },
        () => dispatchWorker(),
      ),
    );
    failures += dispatchResults.filter((accepted) => !accepted).length;
    setMessage(
      failures
        ? `${validFiles.length - failures} cartões enviados para correção; ${failures} precisam de atenção.`
        : `${validFiles.length} cartões foram enviados para correção.`,
    );
    setSubmitting(false);
    router.push(`/dashboard/corrigir-provas/lotes/${batch.id}`);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl bg-primary-soft p-5">
        <h2 className="font-bold text-primary">Antes de fotografar</h2>
        <p className="mt-2 max-w-3xl text-sm text-foreground">
          Fotografe o cartão inteiro, mantenha os quatro marcadores e o QR Code visíveis, evite
          sombras e reflexos e deixe o celular paralelo ao papel.
        </p>
      </section>

      <section
        aria-live={submitting ? "polite" : undefined}
        className="rounded-xl border border-primary/20 bg-primary-soft/50 p-4"
      >
        <p className="font-semibold text-foreground">
          A primeira correção pode levar um pouco mais de tempo
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Se o serviço ficou alguns minutos sem uso, ele precisa ser ativado antes de começar.
          Depois, os cartões serão analisados em uma fila controlada para evitar falhas por demora; você poderá acompanhar o andamento nesta tela.
        </p>
        {submitting && (
          <p className="mt-2 text-sm font-medium text-primary">
            Preparando o lote e enviando as imagens… isso pode levar alguns instantes.
          </p>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 font-semibold">
          Avaliação
          <select
            value={examId}
            onChange={(event) => {
              const nextExamId = event.target.value;
              setExamId(nextExamId);
              const nextExam = exams.find((item) => item.id === nextExamId);
              setClassId(nextExam?.classes.length === 1 ? nextExam.classes[0].id : "");
            }}
            className="h-11 w-full rounded-lg border bg-background px-3 font-normal"
          >
            <option value="">Selecione uma avaliação</option>
            {exams.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <div className="rounded-lg border bg-background p-3 text-sm">
          {exam ? (
            <>
              <strong>{exam.subject}</strong>
              <p className="text-muted-foreground">{exam.questions} questões · {exam.classes.length} turma(s) associada(s)</p>
            </>
          ) : (
            <p className="text-muted-foreground">Os dados da prova aparecerão aqui.</p>
          )}
        </div>
      </div>

      {exam && (
        <label className="block space-y-2 font-semibold">
          Turma deste lote
          <select
            required
            value={classId}
            onChange={(event) => setClassId(event.target.value)}
            className="h-11 w-full rounded-lg border bg-background px-3 font-normal"
          >
            <option value="">Selecione a turma</option>
            {exam.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
      )}

      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void addFiles(event.dataTransfer.files);
        }}
        className="rounded-xl border-2 border-dashed border-input bg-background p-6 text-center"
      >
        <UploadSimpleIcon size={30} className="mx-auto text-primary" aria-hidden="true" />
        <p className="mt-3 font-semibold">Arraste as fotos ou escolha no dispositivo</p>
        <p className="mt-1 text-sm text-muted-foreground">JPG ou PNG, até 12 MB cada e 50 por lote.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => fileInput.current?.click()} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 font-semibold text-white">
            <ImageIcon /> Escolher imagens
          </button>
          <button type="button" onClick={() => cameraInput.current?.click()} className="inline-flex min-h-11 items-center gap-2 rounded-lg border bg-background px-4 font-semibold">
            <CameraIcon /> Abrir câmera
          </button>
        </div>
        <input ref={fileInput} hidden multiple type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" onChange={(event) => event.target.files && void addFiles(event.target.files)} />
        <input ref={cameraInput} hidden type="file" accept="image/*" capture="environment" onChange={(event) => event.target.files && void addFiles(event.target.files)} />
      </div>

      {files.length > 0 && (
        <section>
          <div className="flex items-center justify-between">
            <h2 className="font-bold">{files.length} imagens selecionadas</h2>
            <button type="button" className="text-sm font-semibold text-danger" onClick={() => files.forEach((item) => removeFile(item.id))}>
              Limpar seleção
            </button>
          </div>
          <div className="mt-3 divide-y rounded-xl border bg-background">
            {files.map((item) => (
              <article key={item.id} className="flex items-center gap-4 p-3">
                <Image src={item.preview} alt="" width={64} height={80} unoptimized className="h-20 w-16 rounded object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{item.file.name}</p>
                  <p className="text-sm text-muted-foreground">{formatFileSize(item.file.size)}</p>
                  {item.error && <p className="mt-1 text-sm font-medium text-danger">{item.error}</p>}
                  {item.status === "uploaded" && <p className="mt-1 flex items-center gap-1 text-sm font-medium text-success"><CheckCircleIcon /> Enviado</p>}
                  {item.status === "uploading" && <p className="mt-1 text-sm font-medium text-info">Enviando…</p>}
                  {item.status === "processing" && <p className="mt-1 text-sm font-medium text-info">Processando…</p>}
                  {item.status === "processed" && <p className="mt-1 flex items-center gap-1 text-sm font-medium text-success"><CheckCircleIcon /> Processamento aceito</p>}
                </div>
                <button type="button" onClick={() => removeFile(item.id)} disabled={submitting} className="grid size-10 place-items-center rounded-lg text-muted-foreground hover:bg-surface" aria-label={`Remover ${item.file.name}`}>
                  <TrashIcon />
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      {message && (
        <p role="status" className="flex items-start gap-2 rounded-lg bg-surface p-4 text-sm">
          <WarningCircleIcon className="mt-0.5 shrink-0" /> {message}
        </p>
      )}

      <button
        type="button"
        onClick={() => void upload()}
        disabled={!exam || !selectedClass || !validFiles.length || submitting}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-5 font-semibold text-white disabled:opacity-50 sm:w-auto"
      >
        {submitting ? "Enviando imagens…" : `Enviar ${validFiles.length || ""} imagens`}
      </button>
    </div>
  );
}
