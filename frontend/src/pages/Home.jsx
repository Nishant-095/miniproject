import { useState } from "react";
import { ArrowRight, Search, X } from "lucide-react";
import ToolCard from "../components/ToolCard.jsx";
import { tools } from "../utils/tools.js";
import usePageTitle from "../hooks/usePageTitle.js";

const categories = ["All tools", "Documents", "Productivity", "Finance"];

export default function Home() {
  usePageTitle("Your everyday toolkit");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All tools");
  const filteredTools = tools.filter((tool) =>
    (category === "All tools" || tool.category === category) &&
    `${tool.title} ${tool.description}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <>
      <section id="tools" className="tools-section shell">
        <div className="section-heading">
          <div><h1>All your tools</h1><p>A few useful things to make your day easier.</p></div>
          <span className="section-count">{tools.length} everyday essentials</span>
        </div>
        <div className="tool-controls">
          <div className="category-tabs" role="group" aria-label="Tool categories">
            {categories.map((item) => (
              <button key={item} onClick={() => setCategory(item)} aria-pressed={category === item} className={category === item ? "selected" : ""}>{item}</button>
            ))}
          </div>
          <div className="tool-search">
            <Search size={17} aria-hidden="true" />
            <input aria-label="Search tools" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a tool…" />
            {query && <button aria-label="Clear search" onClick={() => setQuery("")}><X size={15} /></button>}
          </div>
        </div>
        <p className="sr-only" aria-live="polite">{filteredTools.length} tools found</p>
        <div className="tool-grid">{filteredTools.map((tool) => <ToolCard key={tool.id} tool={tool} />)}</div>
        {filteredTools.length === 0 && (
          <div className="empty-state">
            <Search size={27} /><h3>No tools found</h3><p>Try another word or category.</p>
            <button className="text-link" onClick={() => { setQuery(""); setCategory("All tools"); }}>Show all tools <ArrowRight size={15} /></button>
          </div>
        )}
        <p className="tool-note">File tools work without an account. Sign in to save your tasks, expenses, and notes.</p>
      </section>

      <section id="how-it-works" className="how-section shell">
        <div className="section-heading"><div><h2>Keep your day simple</h2><p>Start with what you need. Everything has its place.</p></div></div>
        <div className="how-grid">
          <article><span className="step-number">01</span><h3>Choose a tool</h3><p>Find a document tool, plan your tasks, or keep track of spending.</p></article>
          <article><span className="step-number">02</span><h3>Make it yours</h3><p>Your account keeps tasks, expenses, and notes together in one workspace.</p></article>
          <article><span className="step-number">03</span><h3>Take it with you</h3><p>Install UtilityHub from the navbar to keep your toolkit close, even offline.</p></article>
        </div>
      </section>
    </>
  );
}
