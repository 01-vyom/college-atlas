(function () {
  "use strict";

  const markdownReport = document.getElementById("markdownReport");
  const csvTable = document.getElementById("csvTable");

  if (markdownReport) loadMarkdownReport(markdownReport);
  if (csvTable) loadCsvTable(csvTable);

  async function loadMarkdownReport(container) {
    try {
      const response = await fetch(container.dataset.mdSrc);
      if (!response.ok) throw new Error(`Could not load ${container.dataset.mdSrc}`);
      const markdown = await response.text();
      container.innerHTML = renderMarkdown(markdown);
    } catch (error) {
      container.innerHTML = `<p class="error-text">${escapeHtml(error.message)}</p>`;
    }
  }

  function renderMarkdown(markdown) {
    const lines = markdown.split(/\r?\n/);
    const html = [];
    let paragraph = [];
    let list = [];

    const flushParagraph = () => {
      if (!paragraph.length) return;
      html.push(`<p>${inline(paragraph.join(" "))}</p>`);
      paragraph = [];
    };

    const flushList = () => {
      if (!list.length) return;
      html.push(`<ul>${list.map((item) => `<li>${inline(item)}</li>`).join("")}</ul>`);
      list = [];
    };

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index].trim();
      if (!line) {
        flushParagraph();
        flushList();
        continue;
      }

      if (line.startsWith("|") && lines[index + 1] && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1])) {
        flushParagraph();
        flushList();
        const rows = [];
        while (lines[index] && lines[index].trim().startsWith("|")) {
          rows.push(splitTableRow(lines[index]));
          index += 1;
        }
        index -= 1;
        html.push(renderTable(rows));
        continue;
      }

      if (line.startsWith("# ")) {
        flushParagraph();
        flushList();
        html.push(`<h1>${inline(line.slice(2))}</h1>`);
        continue;
      }

      if (line.startsWith("## ")) {
        flushParagraph();
        flushList();
        html.push(`<h2>${inline(line.slice(3))}</h2>`);
        continue;
      }

      if (line.startsWith("### ")) {
        flushParagraph();
        flushList();
        html.push(`<h3>${inline(line.slice(4))}</h3>`);
        continue;
      }

      if (line.startsWith("- ")) {
        flushParagraph();
        list.push(line.slice(2));
        continue;
      }

      paragraph.push(line);
    }

    flushParagraph();
    flushList();
    return html.join("");
  }

  function splitTableRow(line) {
    return line.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
  }

  function renderTable(rows) {
    const [headers, separator, ...body] = rows;
    if (!headers || !separator) return "";
    const head = headers.map((cell) => `<th>${inline(cell)}</th>`).join("");
    const rowsHtml = body
      .filter((row) => row.some(Boolean))
      .map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`)
      .join("");
    return `<div class="report-table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${rowsHtml}</tbody></table></div>`;
  }

  async function loadCsvTable(table) {
    const search = document.getElementById("csvSearch");
    const summary = document.getElementById("csvSummary");
    try {
      const response = await fetch("outputs/college_shortlist.csv");
      if (!response.ok) throw new Error("Could not load outputs/college_shortlist.csv");
      const rows = parseCsv(await response.text()).filter((row) => row.some((cell) => cell.trim()));
      const headers = rows.shift() || [];
      const render = () => {
        const query = search.value.trim().toLowerCase();
        const filtered = rows.filter((row) => !query || row.join(" ").toLowerCase().includes(query));
        table.innerHTML = renderCsvTable(headers, filtered.slice(0, 250));
        summary.textContent = `${filtered.length} matching rows. Showing ${Math.min(filtered.length, 250)}.`;
      };
      search.addEventListener("input", render);
      render();
    } catch (error) {
      summary.textContent = error.message;
      table.innerHTML = "";
    }
  }

  function renderCsvTable(headers, rows) {
    const head = headers.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("");
    const body = rows
      .map((row) => `<tr>${headers.map((_, index) => `<td>${escapeHtml(row[index] || "")}</td>`).join("")}</tr>`)
      .join("");
    return `<thead><tr>${head}</tr></thead><tbody>${body}</tbody>`;
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      const next = text[index + 1];
      if (char === '"' && quoted && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === "," && !quoted) {
        row.push(cell);
        cell = "";
      } else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && next === "\n") index += 1;
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else {
        cell += char;
      }
    }

    if (cell || row.length) {
      row.push(cell);
      rows.push(row);
    }
    return rows;
  }

  function inline(text) {
    return escapeHtml(text)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[char]));
  }
})();
