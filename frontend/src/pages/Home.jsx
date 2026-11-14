import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  FileText,
  Grid2X2,
  LockKeyhole,
  Search,
  Sparkles,
  Wallet,
  X,
} from "lucide-react";
import ToolCard from "../components/ToolCard.jsx";
import { tools } from "../utils/tools.js";
import { useAuth } from "../context/AuthContext.jsx";
import usePageTitle from "../hooks/usePageTitle.js";
const categories = ["All tools", "Documents", "Productivity", "Finance"];
function WorkspacePreview() {
  // Displays sample tasks and spending on the homepage.
  return (
    <div
      className="hero-art"
      aria-label="Illustration of the workspace with sample tasks"
    >
      <div className="art-circle circle-one" />
      <div className="art-circle circle-two" />
      <div className="floating-file">
        <span className="tool-icon purple">
          <FileText size={21} />
        </span>
        <div>
          <b>Project_report.pdf</b>
          <small>A little lighter. Ready to share.</small>
        </div>
        <span className="file-check">
          <Check size={15} />
        </span>
      </div>
      <div className="preview-card">
        <div className="preview-top">
          <div>
            <span className="eyebrow">YOUR DAILY OVERVIEW</span>
            <h2>A little more organized.</h2>
          </div>
          <span className="preview-avatar">U</span>
        </div>
        <div className="preview-label">
          <span>On your list</span>
          <span>2 of 3 done</span>
        </div>
        <div className="sample-task">
          <span className="sample-check checked">
            <Check size={13} />
          </span>
          <span className="task-done">Review project notes</span>
          <small>09:00</small>
        </div>
        <div className="sample-task">
          <span className="sample-check checked">
            <Check size={13} />
          </span>
          <span className="task-done">Submit the assignment</span>
          <small>11:30</small>
        </div>
        <div className="sample-task">
          <span className="sample-check" />
          <span>Plan tomorrow</span>
          <small>17:00</small>
        </div>
        <div className="preview-progress">
          <span />
          <span />
          <span className="unfilled" />
        </div>
        <div className="preview-foot">
          <span className="status-dot" /> A little progress, every day.
        </div>
      </div>
      <div className="floating-budget">
        <span className="tool-icon green">
          <Wallet size={20} />
        </span>
        <div>
          <b>Room in your budget</b>
          <small>Your month, at a glance</small>
        </div>
        <span className="mini-chart">
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>
      </div>
      <span className="art-star star-one">✦</span>
      <span className="art-star star-two">✧</span>
      <span className="preview-caption">Workspace preview · sample data</span>
    </div>
  );
}
export default function Home() {
  // Displays the six-tool catalogue and introduction.
  usePageTitle("Your everyday toolkit");
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All tools");
  const filteredTools = tools.filter(
    (tool) =>
      // Checks which items match the condition.
      (category === "All tools" || tool.category === category) &&
      `${tool.title} ${tool.description}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  return (
    <>
      <section className="hero shell">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="status-dot" /> YOUR EVERYDAY TOOLKIT
          </div>
          <h1>
            Small tasks.
            <br />
            One <span>handy place.</span>
          </h1>
          <p className="hero-description">
            From that last-minute PDF to the plans on your list. Bring your
            everyday tools together and make a little room in your day.
          </p>
          <div className="hero-actions">
            <a href="#tools" className="button">
              Explore the tools <ArrowRight size={18} />
            </a>
            <Link to={user ? "/dashboard" : "/register"} className="text-link">
              {user ? "Your workspace" : "Create a free account"}{" "}
              <ArrowUpRight size={16} />
            </Link>
          </div>
          <p className="hero-note">
            <LockKeyhole size={14} /> Public tools for everyone. A private space
            for you.
          </p>
        </div>
        <WorkspacePreview />
      </section>

      <div className="benefit-strip">
        <div className="shell benefit-inner">
          <span>LESS FUSS. MORE DONE.</span>
          <p>
            <Grid2X2 size={17} /> All your tools together
          </p>
          <p>
            <LockKeyhole size={17} /> Personal data stays yours
          </p>
          <p>
            <Sparkles size={17} /> Made for everyday use
          </p>
        </div>
      </div>

      <section id="tools" className="tools-section shell">
        <div className="section-heading">
          <div>
            <div className="eyebrow">FIND YOUR NEXT LITTLE HELPER</div>
            <h2>What can we help with?</h2>
            <p>
              Documents, deadlines, and spending — find the tool for your day.
            </p>
          </div>
          <span className="section-count">
            {tools.length} useful tools. One home.
          </span>
        </div>
        <div className="tool-controls">
          <div
            className="category-tabs"
            role="group"
            aria-label="Tool categories"
          >
            {categories.map((item) => (
              // Builds a value for each item.
              <button
                key={item}
                onClick={() =>
                  // Selects a tool category.
                  setCategory(item)
                }
                aria-pressed={category === item}
                className={category === item ? "selected" : ""}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="tool-search">
            <Search size={16} />
            <input
              aria-label="Search tools"
              value={query}
              onChange={(event) =>
                // Updates the selected value.
                setQuery(event.target.value)
              }
              placeholder="Find a tool…"
            />
            {query && (
              <button
                aria-label="Clear search"
                onClick={() =>
                  // Clears the search text.
                  setQuery("")
                }
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
        <p className="sr-only" aria-live="polite">
          {filteredTools.length} tools found
        </p>
        <div className="tool-grid">
          {filteredTools.map((tool) => (
            // Builds a value for each item.
            <ToolCard key={tool.id} tool={tool} />
          ))}
        </div>
        {filteredTools.length === 0 && (
          <div className="empty-state">
            <Search size={27} />
            <h3>No tools found</h3>
            <p>Try another word or category.</p>
            <button
              className="text-link"
              onClick={() => {
                // Clears search and category filters.
                setQuery("");
                setCategory("All tools");
              }}
            >
              Show all tools <ArrowRight size={15} />
            </button>
          </div>
        )}
        <p className="tool-note">
          Use public tools without an account. Sign in to save your tasks,
          expenses, and notes.
        </p>
      </section>

      <section id="how-it-works" className="how-section shell">
        <div className="section-heading">
          <div>
            <div className="eyebrow">A SIMPLE IDEA</div>
            <h2>A toolkit that grows with you.</h2>
          </div>
          <p>
            One place for the little things
            <br className="desktop-break" /> that take up your day.
          </p>
        </div>
        <div className="how-grid">
          <article>
            <span className="step-number">01</span>
            <h3>Find your tool</h3>
            <p>Browse by category or search for the task you need help with.</p>
          </article>
          <article>
            <span className="step-number">02</span>
            <h3>Make it your own</h3>
            <p>
              Create an account for your personal tasks, expenses, and notes.
            </p>
          </article>
          <article>
            <span className="step-number">03</span>
            <h3>Get on with your day</h3>
            <p>
              Keep the everyday work in one place, with fewer tabs to manage.
            </p>
          </article>
        </div>
      </section>

      <section className="cta-section shell">
        <div className="cta-box">
          <div>
            <span className="eyebrow">
              YOUR DAY, WITH A LITTLE LESS CLUTTER
            </span>
            <h2>
              Give your everyday
              <br />a home of its own.
            </h2>
            <p>Your account is the first step. Make it yours.</p>
            <Link
              className="button button-white"
              to={user ? "/dashboard" : "/register"}
            >
              {user ? "Open your dashboard" : "Get started for free"}{" "}
              <ArrowRight size={17} />
            </Link>
          </div>
          <div className="cta-art" aria-hidden="true">
            <span>
              <CheckCheck size={30} />
            </span>
            <span>
              <FileText size={30} />
            </span>
            <span>
              <Wallet size={30} />
            </span>
          </div>
        </div>
      </section>
    </>
  );
}
