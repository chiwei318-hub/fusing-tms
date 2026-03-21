import { forwardRef, useId } from "react";
import { Input } from "@/components/ui/input";
import { useFieldHistory } from "@/hooks/use-field-history";
import { cn } from "@/lib/utils";

interface HistoryInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  fieldKey: string;
  className?: string;
}

/**
 * A drop-in replacement for <Input> that remembers recently typed values
 * and offers them as autocomplete suggestions via a <datalist>.
 * Values are persisted in localStorage keyed by `fieldKey`.
 */
const HistoryInput = forwardRef<HTMLInputElement, HistoryInputProps>(
  ({ fieldKey, className, onBlur, ...props }, ref) => {
    const { suggestions, recordValue, listId } = useFieldHistory(fieldKey);
    const fallbackId = useId();
    const id = props.id ?? fallbackId;

    return (
      <>
        <Input
          {...props}
          id={id}
          ref={ref}
          list={listId}
          className={cn(className)}
          onBlur={(e) => {
            recordValue(e.target.value);
            onBlur?.(e);
          }}
        />
        {suggestions.length > 0 && (
          <datalist id={listId}>
            {suggestions.map((s, i) => (
              <option key={i} value={s} />
            ))}
          </datalist>
        )}
      </>
    );
  }
);

HistoryInput.displayName = "HistoryInput";
export default HistoryInput;
