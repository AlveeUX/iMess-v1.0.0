import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Megaphone } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import releaseNotes from "../../docs/RELEASE_NOTES.md?raw";

export const ReleaseNotesDialog = ({ mobile = false, onTriggerClick }: { mobile?: boolean; onTriggerClick?: () => void }) => {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          onClick={onTriggerClick}
          className={cn(
            "w-full flex items-center gap-3 px-4 rounded-lg text-sm font-medium",
            "text-muted-foreground transition-all duration-150 hover:bg-sidebar-accent hover:text-foreground active:scale-[0.97]",
            mobile ? "py-3" : "py-2.5",
          )}
        >
          <Megaphone className={mobile ? "w-5 h-5" : "w-4 h-4"} />
          <span className="flex-1 text-left">Release notes</span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-primary" />
            Release notes
          </DialogTitle>
        </DialogHeader>
        <article className="max-h-[65vh] overflow-y-auto pr-1 prose prose-invert prose-sm max-w-none prose-headings:font-bold prose-a:text-primary prose-strong:text-foreground">
          <ReactMarkdown>{releaseNotes}</ReactMarkdown>
        </article>
      </DialogContent>
    </Dialog>
  );
};
