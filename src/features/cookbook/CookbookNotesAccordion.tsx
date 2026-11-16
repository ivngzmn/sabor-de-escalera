import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Progress, ProgressIndicator, ProgressTrack } from "@/components/ui/progress";

export function ChecklistProgress({
  completed,
  total,
  label,
}: {
  completed: number;
  total: number;
  label: string;
}) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground tabular-nums">
        <span>{label}</span>
        <span>
          {completed}/{total}
        </span>
      </div>
      <Progress value={pct} aria-label={label}>
        <ProgressTrack className="h-2">
          <ProgressIndicator />
        </ProgressTrack>
      </Progress>
    </div>
  );
}

export function CookbookNotesAccordion({
  sourceNote,
  flags,
}: {
  sourceNote: string | null;
  flags: string[];
}) {
  if (!sourceNote && flags.length === 0) return null;
  const defaultValue = flags.length > 0 ? ["notes"] : ["source"];
  return (
    <section className="rounded-2xl border border-border bg-card px-5 py-2 shadow-xs">
      <Accordion multiple defaultValue={defaultValue}>
        {flags.length > 0 && (
          <AccordionItem value="notes">
            <AccordionHeader>
              <AccordionTrigger>
                Transcription notes ({flags.length})
              </AccordionTrigger>
            </AccordionHeader>
            <AccordionPanel className="pb-3">
              <p className="m-0 mb-2 text-xs font-medium text-masa-foreground">
                Check these against the book before marking the text reviewed.
              </p>
              <ul className="m-0 flex flex-col gap-1 ps-5 text-sm text-foreground">
                {flags.map((flag, idx) => (
                  <li key={idx}>{flag}</li>
                ))}
              </ul>
            </AccordionPanel>
          </AccordionItem>
        )}
        {sourceNote && (
          <AccordionItem value="source">
            <AccordionHeader>
              <AccordionTrigger>Source cleared</AccordionTrigger>
            </AccordionHeader>
            <AccordionPanel className="pb-3">
              <p className="m-0 text-sm break-words text-foreground">
                {sourceNote}
              </p>
            </AccordionPanel>
          </AccordionItem>
        )}
      </Accordion>
    </section>
  );
}
