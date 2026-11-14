import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartNoAxesColumn, ChartPie } from "lucide-react";
import { categoryColors, money, monthName } from "../utils/expenses.js";
export default function ExpenseCharts({ summary }) {
  // Displays spending charts for the selected month.
  const [view, setView] = useState("daily");
  const daily = summary.daily.map((row) =>
    // Builds a value for each item.
    ({
      label: String(row.day),
      amount: row.totalPaise / 100,
    }),
  );
  const monthly = summary.monthly.map((row) =>
    // Builds a value for each item.
    ({
      label: monthName(row.month).split(" ")[0].slice(0, 3),
      fullLabel: monthName(row.month),
      amount: row.totalPaise / 100,
    }),
  );
  const pie = summary.categories.map((row) =>
    // Builds a value for each item.
    ({
      ...row,
      amount: row.totalPaise / 100,
    }),
  );
  return (
    <div className="expense-charts">
      <section className="expense-chart-card" aria-label="Spending by category">
        <div className="expense-chart-heading">
          <div>
            <h2>Where it went</h2>
            <p>Spending by category · {monthName(summary.month)}</p>
          </div>
          <ChartPie size={18} />
        </div>
        {pie.length ? (
          <>
            <div
              className="expense-donut"
              role="img"
              aria-label={`Category chart; amounts listed below. Total ${money(summary.totalPaise)}.`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pie}
                    dataKey="amount"
                    nameKey="category"
                    innerRadius="64%"
                    outerRadius="91%"
                    paddingAngle={3}
                    stroke="none"
                    isAnimationActive={false}
                  >
                    {pie.map((row) => (
                      // Builds a value for each item.
                      <Cell
                        key={row.category}
                        fill={categoryColors[row.category]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "var(--surface)",
                      color: "var(--text)",
                      borderColor: "var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(value) =>
                      // Formats chart amounts in rupees.
                      money(Math.round(Number(value) * 100))
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="expense-donut-center">
                <small>TOTAL SPENT</small>
                <b>{money(summary.totalPaise)}</b>
              </div>
            </div>
            <ul className="expense-chart-legend">
              {pie.map((row) => (
                // Builds a value for each item.
                <li key={row.category}>
                  <i
                    style={{
                      background: categoryColors[row.category],
                    }}
                  />
                  <span>{row.category}</span>
                  <b>{money(row.totalPaise)}</b>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="expense-chart-empty">
            <ChartPie size={37} />
            <p>Add an expense to see where your money goes.</p>
          </div>
        )}
      </section>
      <section className="expense-chart-card" aria-label="Spending over time">
        <div className="expense-chart-heading">
          <div>
            <h2>
              {view === "daily"
                ? "Your month, day by day"
                : "The bigger picture"}
            </h2>
            <p>
              {view === "daily"
                ? monthName(summary.month)
                : `12 months ending ${monthName(summary.month)}`}
            </p>
          </div>
          <ChartNoAxesColumn size={18} />
        </div>
        <div className="expense-chart-tabs">
          <button
            aria-pressed={view === "daily"}
            onClick={() =>
              // Switches the chart between daily and monthly views.
              setView("daily")
            }
          >
            Daily
          </button>
          <button
            aria-pressed={view === "monthly"}
            onClick={() =>
              // Switches the chart between daily and monthly views.
              setView("monthly")
            }
          >
            Monthly
          </button>
        </div>
        <div
          className="expense-bars"
          aria-label={`${view} spending in Indian rupees`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={view === "daily" ? daily : monthly}
              margin={{
                top: 16,
                right: 8,
                left: 0,
                bottom: 5,
              }}
              accessibilityLayer
            >
              <CartesianGrid
                vertical={false}
                stroke="var(--chart-grid)"
                strokeDasharray="3 3"
              />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{
                  fontSize: 10,
                  fill: "var(--chart-text)",
                }}
                interval="preserveStartEnd"
                minTickGap={12}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                width={48}
                tick={{
                  fontSize: 9,
                  fill: "var(--chart-text)",
                }}
                tickFormatter={(value) =>
                  // Formats compact chart axis labels.
                  new Intl.NumberFormat("en-IN", {
                    notation: "compact",
                    maximumFractionDigits: 1,
                  }).format(value)
                }
              />
              <Tooltip
                contentStyle={{
                  background: "var(--surface)",
                  color: "var(--text)",
                  borderColor: "var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value) =>
                  // Formats spending values in the tooltip.
                  [money(Math.round(Number(value) * 100)), "Spent"]
                }
                labelFormatter={(label, rows) =>
                  // Formats the selected date or month label.
                  view === "monthly"
                    ? rows?.[0]?.payload?.fullLabel || label
                    : `${label} ${monthName(summary.month)}`
                }
                cursor={{
                  fill: "var(--surface-soft)",
                }}
              />
              <Bar
                dataKey="amount"
                fill="#aaa0dd"
                radius={[4, 4, 0, 0]}
                maxBarSize={view === "daily" ? 16 : 24}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="expense-chart-caption">
          Amounts in INR. Days and months without expenses are shown as zero.
        </p>
        <details className="expense-chart-data">
          <summary>View chart values as text</summary>
          <div>
            {(view === "daily"
              ? summary.daily.map((row) =>
                  // Builds a value for each item.
                  ({
                    label: row.date,
                    totalPaise: row.totalPaise,
                  }),
                )
              : summary.monthly.map((row) =>
                  // Builds a value for each item.
                  ({
                    label: row.month,
                    totalPaise: row.totalPaise,
                  }),
                )
            ).map((row) => (
              // Builds a value for each item.
              <span key={row.label}>
                {row.label}: {money(row.totalPaise)}
              </span>
            ))}
          </div>
        </details>
      </section>
    </div>
  );
}
