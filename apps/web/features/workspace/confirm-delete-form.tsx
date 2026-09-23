"use client";

export function ConfirmDeleteForm({
  action,
  fieldName,
  value,
  message,
  label = "Excluir",
}: {
  action: (formData: FormData) => void | Promise<void>;
  fieldName: string;
  value: string;
  message: string;
  label?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      <input type="hidden" name={fieldName} value={value} />
      <button type="submit" className="min-h-11 rounded-lg border border-danger px-3 text-sm font-semibold text-danger hover:bg-danger-soft">
        {label}
      </button>
    </form>
  );
}
