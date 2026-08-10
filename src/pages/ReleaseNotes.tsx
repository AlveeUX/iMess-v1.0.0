import { Card } from "@/components/ui/card";
import ReactMarkdown from "react-markdown";
import { Megaphone } from "lucide-react";
import releaseNotes from "../../docs/RELEASE_NOTES.md?raw";

const ReleaseNotes = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Megaphone className="w-7 h-7 text-primary" />
          Release notes
        </h1>
        <p className="text-muted-foreground mt-1">What's new in MessPilot.</p>
      </div>

      <Card className="p-6 md:p-8 gradient-card border-border/50 shadow-card">
        <article className="prose prose-invert prose-sm md:prose-base max-w-none prose-headings:font-bold prose-a:text-primary prose-strong:text-foreground">
          <ReactMarkdown>{releaseNotes}</ReactMarkdown>
        </article>
      </Card>
    </div>
  );
};

export default ReleaseNotes;
