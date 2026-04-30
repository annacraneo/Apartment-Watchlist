import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

interface BoroughComboboxProps {
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  options: string[];
  className?: string;
  triggerClassName?: string;
}

export function BoroughCombobox({ value, onChange, options, triggerClassName }: BoroughComboboxProps) {
  const [open, setOpen] = React.useState(false);

  const display = value && value !== "unknown" ? value : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal", triggerClassName)}
        >
          <span className={cn("truncate", !display && "text-muted-foreground")}>
            {display ?? "Select borough…"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search borough…" />
          <CommandList>
            <CommandEmpty>No borough found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="unknown"
                onSelect={() => { onChange(null); setOpen(false); }}
              >
                <Check className={cn("mr-2 h-4 w-4", !display ? "opacity-100" : "opacity-0")} />
                Unknown
              </CommandItem>
              {options.map((b) => (
                <CommandItem
                  key={b}
                  value={b}
                  onSelect={(v) => { onChange(v); setOpen(false); }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === b ? "opacity-100" : "opacity-0")} />
                  {b}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
