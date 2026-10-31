"use client";

import { HexColorPicker } from "react-colorful";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export const SWATCHES = [
  "#e4e4e9",
  "#c9d8fb",
  "#c6efd6",
  "#f7d9c4",
  "#e9d5f7",
  "#fbd5d5",
  "#d5e8f7",
  "#f5f0c9",
  "#868e96",
  "#1971c2",
  "#2f9e44",
  "#f08c00",
  "#e03131",
  "#9c36b5",
  "#0b7285",
  "#c2255c",
];

export interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  label?: string;
  swatches?: string[];
  className?: string;
}

export function ColorPicker({
  value,
  onChange,
  label = "Colour",
  swatches = SWATCHES,
  className,
}: ColorPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={className}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-2"
              aria-label={label}
            />
          }
        >
          <span
            aria-hidden="true"
            className="size-4 shrink-0 rounded-[4px] border border-black/15"
            style={{ backgroundColor: value }}
          />
          <span className="font-mono text-xs uppercase">{value}</span>
        </PopoverTrigger>

        <PopoverContent align="start" className="w-auto gap-3">
          <div className="grid grid-cols-8 gap-1.5">
            {swatches.map((swatch) => (
              <button
                key={swatch}
                type="button"
                aria-label={swatch}
                aria-pressed={value.toLowerCase() === swatch.toLowerCase()}
                onClick={() => {
                  onChange(swatch);
                  setOpen(false);
                }}
                className="size-6 rounded-[6px] border border-black/15 transition-transform hover:scale-110 aria-pressed:ring-2 aria-pressed:ring-foreground/40"
                style={{ backgroundColor: swatch }}
              />
            ))}
          </div>

          <HexColorPicker
            color={value}
            onChange={onChange}
            className="!h-32 !w-56"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
