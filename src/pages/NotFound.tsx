import { Link } from "react-router-dom";
import { ArrowLeft, MapPinOff } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-6">
      <div className="paper-card p-10 text-center max-w-md">
        <div className="w-14 h-14 rounded-full bg-magenta-reg/10 flex items-center justify-center mx-auto">
          <MapPinOff className="w-6 h-6 text-magenta-reg" />
        </div>
        <div className="text-[11px] uppercase tracking-widest text-ink-mute mt-6">
          404 · Page not found
        </div>
        <h1 className="font-display text-3xl font-bold mt-1">Off the press</h1>
        <p className="text-ink-mute mt-2 text-sm">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link to="/" className="btn btn-primary mt-6 inline-flex">
          <ArrowLeft className="w-4 h-4" /> Back to Sales
        </Link>
      </div>
    </div>
  );
}
