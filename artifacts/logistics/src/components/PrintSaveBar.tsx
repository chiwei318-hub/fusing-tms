import { Printer, FileDown, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";

interface PrintSaveBarProps {
  title?: string;
  subtitle?: string;
  onExportCsv?: () => void;
  csvLabel?: string;
  className?: string;
  size?: "sm" | "default";
}

export function PrintSaveBar({
  title,
  subtitle,
  onExportCsv,
  csvLabel = "匯出 CSV",
  className = "",
  size = "sm",
}: PrintSaveBarProps) {
  const handlePrint = () => {
    if (title) {
      document.title = title;
    }
    window.print();
  };

  return (
    <>
      {/* Print-only header (hidden on screen) */}
      {(title || subtitle) && (
        <div className="hidden print:block mb-4 border-b pb-3">
          {title && <h1 className="text-xl font-bold">{title}</h1>}
          {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
          <p className="text-xs text-gray-400 mt-1">
            列印時間：{format(new Date(), "yyyy/MM/dd HH:mm", { locale: zhTW })}
          </p>
        </div>
      )}

      {/* Action bar (hidden when printing) */}
      <div className={`flex items-center gap-2 no-print ${className}`}>
        <Button
          size={size}
          variant="outline"
          className="gap-1.5"
          onClick={handlePrint}
        >
          <Printer className="w-3.5 h-3.5" />
          列印
        </Button>
        <Button
          size={size}
          variant="outline"
          className="gap-1.5"
          onClick={handlePrint}
        >
          <FileDown className="w-3.5 h-3.5" />
          儲存 PDF
        </Button>
        {onExportCsv && (
          <Button
            size={size}
            variant="outline"
            className="gap-1.5"
            onClick={onExportCsv}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            {csvLabel}
          </Button>
        )}
      </div>
    </>
  );
}
