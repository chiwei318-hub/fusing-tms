import { Component, type ReactNode, type ErrorInfo } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  tabName?: string;
}

interface State {
  error: Error | null;
}

export class TabErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[TabErrorBoundary] ${this.props.tabName ?? "Tab"} crashed:`, error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
          <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center mb-4">
            <AlertTriangle className="w-7 h-7 text-red-500" />
          </div>
          <h3 className="font-bold text-gray-800 text-base mb-1">
            {this.props.tabName ? `「${this.props.tabName}」載入失敗` : "此功能載入失敗"}
          </h3>
          <p className="text-sm text-gray-500 mb-5 max-w-xs">
            {this.state.error.message || "發生未知錯誤，其他功能不受影響"}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> 重新載入
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
