import { ArrowUpRight, LockKeyhole } from "lucide-react";
import { Link } from "react-router-dom";
export default function ToolCard({ tool }) {
  // Displays a tool link and access label.
  const Icon = tool.icon;
  return (
    <Link className="tool-card" to={tool.path}>
      <div className="flex items-center justify-between">
        <span className={`tool-icon ${tool.tone}`}>
          <Icon size={22} aria-hidden="true" />
        </span>
        <ArrowUpRight className="tool-arrow" size={18} aria-hidden="true" />
      </div>
      <h3>{tool.title}</h3>
      <p>{tool.description}</p>
      <div className="tool-meta">
        <span>
          {tool.private ? (
            <>
              <LockKeyhole size={11} /> Personal
            </>
          ) : (
            "No account needed"
          )}
        </span>
        <span className="tool-status available-tag">Ready to use</span>
      </div>
    </Link>
  );
}
