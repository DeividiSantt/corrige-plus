import styles from "./correction-loader.module.css";

export function CorrectionLoader({ activeCount }: { activeCount: number }) {
  return (
    <section className={styles.stage} role="status" aria-live="polite" aria-label="Correção em andamento">
      <div className={styles.book} aria-hidden="true">
        <div className={styles.shadow} />
        <div className={styles.page} />
        <div className={styles.page} />
        <div className={styles.page} />
        <div className={styles.page} />
        <div className={styles.page} />
      </div>
      <div>
        <p className="font-semibold">Analisando os cartões</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {activeCount} {activeCount === 1 ? "cartão está" : "cartões estão"} na fila. A primeira análise pode levar um pouco mais de tempo.
        </p>
      </div>
    </section>
  );
}
