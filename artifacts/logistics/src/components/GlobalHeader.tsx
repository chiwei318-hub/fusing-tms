import { Truck } from "lucide-react";

export function GlobalHeader() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-11 bg-white border-b border-gray-200 shadow-sm">
      <div className="h-full px-3 sm:px-5 flex items-center justify-between">
        {/* Left: Company Logo */}
        <div className="flex items-center h-full py-1">
          <img
            src="/logo-transparent.png"
            alt="富詠運輸"
            className="h-8 w-auto max-w-[160px] sm:max-w-[200px] object-contain"
            onError={(e) => {
              const img = e.currentTarget as HTMLImageElement;
              img.style.display = "none";
              const fb = img.nextElementSibling as HTMLElement | null;
              if (fb) fb.style.display = "flex";
            }}
          />
          {/* Fallback if logo.png not found */}
          <div className="hidden items-center gap-2">
            <div className="bg-[#1a3a8f] p-1.5 rounded-lg">
              <Truck className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-base text-[#1a3a8f]">富詠運輸</span>
          </div>
        </div>

        {/* Right: System Name */}
        <span className="font-bold text-sm sm:text-base text-[#1a3a8f] tracking-wide whitespace-nowrap">
          富詠運輸系統
        </span>
      </div>
    </header>
  );
}
