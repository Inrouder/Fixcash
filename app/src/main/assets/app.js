"use strict";

(() => {
  const STORAGE_KEY = "fixcash.entries.v1";
  const MONTHS_PER_CADENCE = { monthly: 1, quarterly: 3, semiannual: 6, yearly: 12 };
  const CADENCE_LABELS = { monthly: "monatlich", quarterly: "vierteljährlich", semiannual: "halbjährlich", yearly: "jährlich" };
  const STATUS_LABELS = { active: "Aktiv", terminated: "Gekündigt", archived: "Archiviert" };
  const today = new Date();
  const todayKey = localDateKey(today);
  const currentMonth = todayKey.slice(0, 7);
  let entries;
  let editingId = null;
  let noticeTimer;

  const $ = (selector) => document.querySelector(selector);
  const form = $("#entry-form");
  const money = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
  const dateFormat = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });
  entries = loadEntries();

  function dateKey(date) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  }

  function localDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function parseDate(key) {
    if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
    const [year, month, day] = key.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
  }

  function addMonths(key, amount) {
    const date = parseDate(key);
    if (!date) return null;
    const originalDay = date.getUTCDate();
    const firstOfTarget = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1));
    const lastDay = new Date(Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth() + 1, 0)).getUTCDate();
    return dateKey(new Date(Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth(), Math.min(originalDay, lastDay))));
  }

  function deadlineFor(entry) {
    if (!entry.contractStart || entry.minTermMonths === null || entry.noticeMonths === null) return null;
    const minimumEnd = addMonths(entry.contractStart, entry.minTermMonths);
    return minimumEnd ? addMonths(minimumEnd, -entry.noticeMonths) : null;
  }

  function monthlyAmount(entry) {
    return entry.amount / (MONTHS_PER_CADENCE[entry.cadence] || 1);
  }

  function isInValidity(entry) {
    if (entry.validity !== "limited") return true;
    return Boolean(entry.validFrom && entry.validUntil && entry.validFrom <= todayKey && todayKey <= entry.validUntil);
  }

  function activeEntries() {
    return entries.filter((entry) => entry.status === "active" && isInValidity(entry));
  }

  function loadEntries() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return [];
      const data = JSON.parse(saved);
      if (!Array.isArray(data) || data.some((item) => !item || typeof item !== "object" || typeof item.id !== "string")) {
        throw new Error("Die gespeicherten Einträge haben ein unerwartetes Format.");
      }
      return data;
    } catch (error) {
      setNotice(`Lokale Daten konnten nicht geladen werden: ${error.message}`, true);
      return [];
    }
  }

  function saveEntries() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
      clearNotice();
      return true;
    } catch (error) {
      setNotice(`Speichern fehlgeschlagen: ${error.message}. Änderungen sind nur bis zum Schließen der App verfügbar.`, true);
      return false;
    }
  }

  function setNotice(message, isError = false) {
    const notice = $("#app-notice");
    notice.textContent = message;
    notice.classList.toggle("error", isError);
    notice.classList.remove("hidden");
    window.clearTimeout(noticeTimer);
    if (!isError) noticeTimer = window.setTimeout(() => notice.classList.add("hidden"), 5000);
  }

  function clearNotice() {
    $("#app-notice").classList.add("hidden");
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function formatDate(key) {
    const date = parseDate(key);
    return date ? dateFormat.format(date) : "–";
  }

  function statusBadge(status) {
    const label = STATUS_LABELS[status] || STATUS_LABELS.active;
    return `<span class="badge ${escapeHtml(status)}">${escapeHtml(label)}</span>`;
  }

  function monthlyPreview() {
    const amount = Number($("#amount").value);
    const months = MONTHS_PER_CADENCE[$("#cadence").value];
    $("#monthly-preview").textContent = Number.isFinite(amount) && amount > 0
      ? `${money.format(amount / months)} pro Monat (${money.format(amount)} ${CADENCE_LABELS[$("#cadence").value]})`
      : "";
  }

  function renderDashboard() {
    const active = activeEntries();
    const income = active.filter((entry) => entry.type === "income").reduce((sum, entry) => sum + monthlyAmount(entry), 0);
    const expense = active.filter((entry) => entry.type === "expense").reduce((sum, entry) => sum + monthlyAmount(entry), 0);
    $("#total-income").textContent = money.format(income);
    $("#total-expense").textContent = money.format(expense);
    $("#total-net").textContent = money.format(income - expense);
    $("#total-net").classList.toggle("negative", income - expense < 0);
    $("#month-label").textContent = today.toLocaleDateString("de-DE", { month: "long", year: "numeric" });

    const reminders = entries
      .filter((entry) => entry.status === "active" && entry.type === "expense" && isInValidity(entry))
      .map((entry) => ({ entry, deadline: deadlineFor(entry) }))
      .filter(({ deadline }) => deadline && deadline.slice(0, 7) === currentMonth)
      .sort((left, right) => left.deadline.localeCompare(right.deadline));
    $("#reminder-count").textContent = reminders.length ? `${reminders.length} ${reminders.length === 1 ? "Frist" : "Fristen"}` : "";
    $("#reminders").innerHTML = reminders.length
      ? reminders.map(({ entry, deadline }) => `<div class="reminder"><div><strong>${escapeHtml(entry.name)}</strong><span>${escapeHtml(entry.category)}${entry.contractNumber ? ` · Vertrag ${escapeHtml(entry.contractNumber)}` : ""}${deadline < todayKey ? " · Frist verstrichen" : ""}</span></div><span class="reminder-date">${escapeHtml(formatDate(deadline))}</span></div>`).join("")
      : '<div class="empty">Keine aktiven Kündigungsfristen in diesem Monat.</div>';

    const recent = active.slice().sort((left, right) => (right.createdAt || "").localeCompare(left.createdAt || "")).slice(0, 5);
    $("#recent-entries").innerHTML = recent.length
      ? recent.map(entryMarkup).join("")
      : '<div class="empty">Noch keine aktiven Einträge. Lege deinen ersten Eintrag an.</div>';
  }

  function entryMarkup(entry) {
    const kind = entry.type === "income" ? "Einnahme" : "Ausgabe";
    const amountClass = entry.type === "income" ? "income" : "expense";
    const validity = entry.validity === "limited"
      ? `bis ${escapeHtml(formatDate(entry.validUntil))}`
      : "unbefristet";
    return `<article class="entry"><div><div class="entry-name">${escapeHtml(entry.name)}</div><div class="entry-meta">${kind} · ${escapeHtml(entry.category)} · ${escapeHtml(CADENCE_LABELS[entry.cadence] || "monatlich")} · ${validity}</div></div><div class="entry-amount ${amountClass}">${money.format(entry.amount)} <span class="panel-hint">/ ${escapeHtml(CADENCE_LABELS[entry.cadence] || "Monat")}</span></div><div class="entry-actions">${statusBadge(entry.status)}<button class="button small" type="button" data-action="edit" data-id="${escapeHtml(entry.id)}">Bearbeiten</button></div></article>`;
  }

  function renderEntries() {
    const ordered = entries.slice().sort((left, right) => (right.createdAt || "").localeCompare(left.createdAt || ""));
    $("#entry-count").textContent = `${entries.length} ${entries.length === 1 ? "Eintrag" : "Einträge"}`;
    $("#all-entries").innerHTML = ordered.length
      ? ordered.map(entryMarkup).join("")
      : '<div class="empty">Noch keine Einträge vorhanden.</div>';
  }

  function renderContracts() {
    const ordered = entries.slice().sort((left, right) => (right.createdAt || "").localeCompare(left.createdAt || ""));
    $("#contract-count").textContent = `${entries.length} ${entries.length === 1 ? "Vertrag" : "Verträge"}`;
    $("#contracts-list").innerHTML = ordered.length ? ordered.map((entry) => {
      const deadline = deadlineFor(entry);
      const details = [
        entry.contractNumber ? `Vertragsnummer: ${escapeHtml(entry.contractNumber)}` : "",
        entry.contractStart ? `Beginn: ${escapeHtml(formatDate(entry.contractStart))}` : "",
        entry.minTermMonths !== null ? `Mindestlaufzeit: ${entry.minTermMonths} Monate` : "",
        entry.noticeMonths !== null ? `Kündigungsfrist: ${entry.noticeMonths} Monate` : "",
        deadline ? `Spätestes Kündigungsdatum: ${escapeHtml(formatDate(deadline))}` : ""
      ].filter(Boolean).join(" · ");
      return `<article class="contract-card"><div><h3>${escapeHtml(entry.name)}</h3><p>${details || "Noch keine Vertrags- oder Kündigungsdaten hinterlegt."}</p><p>${escapeHtml(entry.purpose || entry.category)} · ${escapeHtml(entry.type === "income" ? "Einnahme" : "Ausgabe")}</p></div><div class="contract-card-right">${statusBadge(entry.status)}<div class="contract-controls"><select aria-label="Status für ${escapeHtml(entry.name)}" data-status="${escapeHtml(entry.id)}"><option value="active" ${entry.status === "active" ? "selected" : ""}>Aktiv</option><option value="terminated" ${entry.status === "terminated" ? "selected" : ""}>Gekündigt</option><option value="archived" ${entry.status === "archived" ? "selected" : ""}>Archiviert</option></select><button class="button small" type="button" data-action="edit" data-id="${escapeHtml(entry.id)}">Bearbeiten</button>${entry.type === "expense" ? `<button class="button small" type="button" data-action="letter" data-id="${escapeHtml(entry.id)}">Kündigung</button>` : ""}</div></div></article>`;
    }).join("") : '<div class="empty">Noch keine Verträge vorhanden. Verträge und Einträge werden gemeinsam verwaltet.</div>';
  }

  function render() {
    renderDashboard();
    renderEntries();
    renderContracts();
  }

  function showPage(page) {
    document.querySelectorAll("main > section").forEach((section) => section.classList.toggle("hidden", section.id !== `page-${page}`));
    document.querySelectorAll(".nav [data-page]").forEach((button) => button.classList.toggle("active", button.dataset.page === page));
    if (page === "entries" && !editingId) {
      $("#entry-list-view").classList.remove("hidden");
      $("#entry-form-view").classList.add("hidden");
    }
    window.scrollTo(0, 0);
  }

  function resetForm() {
    form.reset();
    editingId = null;
    $("#form-title").textContent = "Neuer Eintrag";
    $("#delete-entry").classList.add("hidden");
    $("#validity-start-field").classList.add("hidden");
    $("#validity-end-field").classList.add("hidden");
    $("#validFrom").required = false;
    $("#validUntil").required = false;
    monthlyPreview();
  }

  function openForm(entry = null) {
    resetForm();
    showPage("entries");
    $("#entry-list-view").classList.add("hidden");
    $("#entry-form-view").classList.remove("hidden");
    if (entry) {
      editingId = entry.id;
      $("#form-title").textContent = "Eintrag bearbeiten";
      $("#delete-entry").classList.remove("hidden");
      for (const key of ["name", "amount", "type", "cadence", "purpose", "contractNumber", "category", "validity", "validFrom", "validUntil", "contractStart", "minTermMonths", "noticeMonths", "status"]) {
        form.elements[key].value = entry[key] ?? (key === "status" ? "active" : "");
      }
    }
    updateValidityFields();
    monthlyPreview();
    window.scrollTo(0, 0);
  }

  function updateValidityFields() {
    const limited = $("#validity").value === "limited";
    $("#validity-start-field").classList.toggle("hidden", !limited);
    $("#validity-end-field").classList.toggle("hidden", !limited);
    $("#validFrom").required = limited;
    $("#validUntil").required = limited;
  }

  function readNullableMonths(value) {
    if (value === "") return null;
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 && number <= 1200 ? number : null;
  }

  function handleSubmit(event) {
    event.preventDefault();
    const data = new FormData(form);
    const amount = Number(data.get("amount"));
    if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999) {
      setNotice("Bitte gib einen gültigen Betrag größer als 0 ein.", true);
      return;
    }
    const validity = String(data.get("validity"));
    const validFrom = String(data.get("validFrom"));
    const validUntil = String(data.get("validUntil"));
    if (validity === "limited" && (!parseDate(validFrom) || !parseDate(validUntil) || validUntil < validFrom)) {
      setNotice("Bitte prüfe den Gültigkeitszeitraum: Das Enddatum muss am oder nach dem Startdatum liegen.", true);
      return;
    }
    const minTermMonths = readNullableMonths(String(data.get("minTermMonths")));
    const noticeMonths = readNullableMonths(String(data.get("noticeMonths")));
    if ((data.get("minTermMonths") !== "" && minTermMonths === null) || (data.get("noticeMonths") !== "" && noticeMonths === null)) {
      setNotice("Mindestlaufzeit und Kündigungsfrist müssen ganze Monate zwischen 0 und 1200 sein.", true);
      return;
    }
    const contractStart = String(data.get("contractStart"));
    if (contractStart && !parseDate(contractStart)) {
      setNotice("Bitte gib ein gültiges Vertragsbeginn-Datum ein.", true);
      return;
    }
    const previous = editingId ? entries.find((entry) => entry.id === editingId) : null;
    const entry = {
      id: editingId || (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`),
      name: String(data.get("name")).trim(),
      amount,
      type: String(data.get("type")),
      purpose: String(data.get("purpose")).trim(),
      contractNumber: String(data.get("contractNumber")).trim(),
      category: String(data.get("category")).trim(),
      cadence: String(data.get("cadence")),
      validity,
      validFrom: validity === "limited" ? validFrom : "",
      validUntil: validity === "limited" ? validUntil : "",
      contractStart,
      minTermMonths,
      noticeMonths,
      status: String(data.get("status")),
      createdAt: previous?.createdAt || new Date().toISOString()
    };
    if (!entry.name || !entry.category || !["income", "expense"].includes(entry.type) || !Object.hasOwn(MONTHS_PER_CADENCE, entry.cadence) || !["active", "terminated", "archived"].includes(entry.status)) {
      setNotice("Bitte überprüfe die Pflichtfelder und wähle gültige Werte aus.", true);
      return;
    }
    if (previous) {
      entries = entries.map((item) => item.id === editingId ? entry : item);
    } else {
      entries.push(entry);
    }
    saveEntries();
    resetForm();
    render();
    showPage("entries");
    $("#entry-list-view").classList.remove("hidden");
    $("#entry-form-view").classList.add("hidden");
  }

  function deleteEntry(id) {
    const entry = entries.find((item) => item.id === id);
    if (!entry || !window.confirm(`„${entry.name}“ wirklich löschen?`)) return;
    entries = entries.filter((item) => item.id !== id);
    saveEntries();
    resetForm();
    render();
    $("#entry-list-view").classList.remove("hidden");
    $("#entry-form-view").classList.add("hidden");
  }

  function csvEscape(value) {
    let text = String(value ?? "");
    if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }

  function exportData(kind) {
    const date = localDateKey(new Date());
    let filename;
    let mimeType;
    let contents;
    if (kind === "csv") {
      filename = `fixcash-${date}.csv`;
      mimeType = "text/csv";
      const fields = ["name", "amount", "type", "purpose", "contractNumber", "category", "cadence", "validity", "validFrom", "validUntil", "contractStart", "minTermMonths", "noticeMonths", "cancellationDeadline", "status"];
      const labels = ["Name", "Betrag", "Art", "Verwendungszweck", "Vertragsnummer", "Kategorie", "Zahlungsrhythmus", "Gültigkeit", "Gültig ab", "Gültig bis", "Vertragsbeginn", "Mindestlaufzeit (Monate)", "Kündigungsfrist (Monate)", "Spätestes Kündigungsdatum", "Status"];
      contents = [labels, ...entries.map((entry) => fields.map((field) => field === "cancellationDeadline" ? deadlineFor(entry) || "" : entry[field] ?? ""))]
        .map((row) => row.map(csvEscape).join(";")).join("\r\n");
    } else {
      filename = `fixcash-${date}.json`;
      mimeType = "application/json";
      contents = JSON.stringify(entries.map((entry) => ({ ...entry, cancellationDeadline: deadlineFor(entry) })), null, 2);
    }
    if (window.Fixcash?.exportFile) {
      window.Fixcash.exportFile(filename, mimeType, contents);
      return;
    }
    const blob = new Blob(["\ufeff", contents], { type: mimeType });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function validateImportedEntries(data) {
    if (!Array.isArray(data)) throw new Error("Das Backup muss eine JSON-Liste von Einträgen enthalten.");
    if (data.length > 10000) throw new Error("Das Backup enthält ungewöhnlich viele Einträge.");
    const allowedCadences = new Set(["monthly", "quarterly", "semiannual", "yearly"]);
    const allowedStatuses = new Set(["active", "terminated", "archived"]);
    const normalized = data.map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`Eintrag ${index + 1} ist ungültig.`);
      const amount = Number(item.amount);
      if (typeof item.name !== "string" || !item.name.trim() ||
          !Number.isFinite(amount) || amount <= 0 ||
          !["income", "expense"].includes(item.type) ||
          !allowedCadences.has(item.cadence) ||
          typeof item.category !== "string" || !item.category.trim() ||
          !["forever", "limited"].includes(item.validity) ||
          !allowedStatuses.has(item.status)) {
        throw new Error(`Eintrag ${index + 1} enthält fehlende oder ungültige Pflichtangaben.`);
      }
      const validity = item.validity;
      if (validity === "limited" &&
          (!parseDate(item.validFrom) || !parseDate(item.validUntil) || item.validUntil < item.validFrom)) {
        throw new Error(`Eintrag ${index + 1} hat einen ungültigen Gültigkeitszeitraum.`);
      }
      const nullableMonths = (value) => value === null || value === undefined || value === "" ? null :
        (Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 1200 ? Number(value) : NaN);
      const minTermMonths = nullableMonths(item.minTermMonths);
      const noticeMonths = nullableMonths(item.noticeMonths);
      if (Number.isNaN(minTermMonths) || Number.isNaN(noticeMonths)) throw new Error(`Eintrag ${index + 1} hat ungültige Laufzeitangaben.`);
      const contractStart = item.contractStart || "";
      if (contractStart && !parseDate(contractStart)) throw new Error(`Eintrag ${index + 1} hat ein ungültiges Vertragsdatum.`);
      return {
        id: typeof item.id === "string" && item.id ? item.id : `import-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
        name: item.name.trim(),
        amount,
        type: item.type,
        purpose: typeof item.purpose === "string" ? item.purpose : "",
        contractNumber: typeof item.contractNumber === "string" ? item.contractNumber : "",
        category: item.category.trim(),
        cadence: item.cadence,
        validity,
        validFrom: validity === "limited" ? item.validFrom : "",
        validUntil: validity === "limited" ? item.validUntil : "",
        contractStart,
        minTermMonths,
        noticeMonths,
        status: item.status,
        createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString()
      };
    });
    const ids = new Set();
    normalized.forEach((entry, index) => {
      if (ids.has(entry.id)) entry.id = `import-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`;
      ids.add(entry.id);
    });
    return normalized;
  }

  function importBackupText(contents) {
    let imported;
    try {
      imported = validateImportedEntries(JSON.parse(contents));
    } catch (error) {
      setNotice(`Import fehlgeschlagen: ${error.message || "Die Datei ist kein gültiges Fixcash-JSON-Backup."}`, true);
      return;
    }
    const count = imported.length;
    const message = `Es wurden ${count} ${count === 1 ? "Eintrag" : "Einträge"} im Backup erkannt. Die aktuell gespeicherten ${entries.length} Einträge werden durch das Backup ersetzt. Exportiere zuerst ein Backup, falls du die aktuellen Daten behalten möchtest. Fortfahren?`;
    if (!window.confirm(message)) return;
    const previousEntries = entries;
    entries = imported;
    if (!saveEntries()) {
      entries = previousEntries;
      return;
    }
    resetForm();
    render();
    showPage("dashboard");
    setNotice(`Import abgeschlossen: ${count} ${count === 1 ? "Eintrag wurde" : "Einträge wurden"} wiederhergestellt.`);
  }

  window.receiveFixcashBackup = importBackupText;

  function cancellationLetter(entry) {
    const deadline = deadlineFor(entry);
    const contractDetails = [
      entry.contractStart ? `Vertragsbeginn: ${formatDate(entry.contractStart)}` : "",
      entry.minTermMonths !== null ? `Mindestlaufzeit: ${entry.minTermMonths} Monate` : "",
      entry.noticeMonths !== null ? `Kündigungsfrist: ${entry.noticeMonths} Monate` : "",
      deadline ? `Spätestes Kündigungsdatum laut Berechnung: ${formatDate(deadline)}` : ""
    ].filter(Boolean);
    return `An: ${entry.name}\n${entry.purpose ? `${entry.purpose}\n` : ""}${entry.contractNumber ? `Vertragsnummer: ${entry.contractNumber}\n` : ""}\n\n${formatDate(todayKey)}\n\nBetreff: Kündigung${entry.contractNumber ? ` des Vertrags ${entry.contractNumber}` : ""}\n\nSehr geehrte Damen und Herren,\n\nhiermit kündige ich den oben genannten Vertrag fristgerecht zum nächstmöglichen Zeitpunkt.${contractDetails.length ? ` Nach meinen Unterlagen gelten folgende Vertragsdaten:\n${contractDetails.join("\n")}.` : ""} Bitte bestätigen Sie mir den Beendigungszeitpunkt schriftlich und sehen Sie von weiteren Abbuchungen nach Vertragsende ab.\n\nMit freundlichen Grüßen\n\n\n[Vor- und Nachname]`;
  }

  function openLetter(entry) {
    $("#letter-text").value = cancellationLetter(entry);
    $("#letter-modal").classList.remove("hidden");
    $("#letter-text").focus();
  }

  async function copyLetter() {
    try {
      await navigator.clipboard.writeText($("#letter-text").value);
      setNotice("Kündigungsschreiben in die Zwischenablage kopiert.");
    } catch {
      $("#letter-text").select();
      const copied = document.execCommand("copy");
      setNotice(copied ? "Kündigungsschreiben in die Zwischenablage kopiert." : "Kopieren nicht möglich. Markiere den Text und kopiere ihn manuell.", !copied);
    }
  }

  document.addEventListener("click", (event) => {
    const pageButton = event.target.closest("[data-page]");
    if (pageButton) {
      showPage(pageButton.dataset.page);
      return;
    }
    const actionButton = event.target.closest("[data-action]");
    if (!actionButton) return;
    const entry = entries.find((item) => item.id === actionButton.dataset.id);
    if (actionButton.dataset.action === "new-entry") openForm();
    if (actionButton.dataset.action === "edit" && entry) openForm(entry);
    if (actionButton.dataset.action === "letter" && entry) openLetter(entry);
  });

  document.addEventListener("change", (event) => {
    if (event.target.matches("[data-status]")) {
      const entry = entries.find((item) => item.id === event.target.dataset.status);
      if (!entry) return;
      entry.status = event.target.value;
      saveEntries();
      render();
      return;
    }
    if (event.target.id === "validity") updateValidityFields();
  });

  $("#amount").addEventListener("input", monthlyPreview);
  $("#cadence").addEventListener("change", monthlyPreview);
  form.addEventListener("submit", handleSubmit);
  $("#cancel-form").addEventListener("click", () => {
    resetForm();
    $("#entry-form-view").classList.add("hidden");
    $("#entry-list-view").classList.remove("hidden");
  });
  $("#delete-entry").addEventListener("click", () => deleteEntry(editingId));
  $("#export-csv").addEventListener("click", () => exportData("csv"));
  $("#export-json").addEventListener("click", () => exportData("json"));
  $("#import-json").addEventListener("click", () => {
    if (window.Fixcash?.importBackup) window.Fixcash.importBackup();
    else setNotice("Der Dateiimport ist nur in der Android-App verfügbar.", true);
  });
  $("#letter-close").addEventListener("click", () => $("#letter-modal").classList.add("hidden"));
  $("#letter-modal").addEventListener("click", (event) => {
    if (event.target === $("#letter-modal")) $("#letter-modal").classList.add("hidden");
  });
  $("#letter-copy").addEventListener("click", copyLetter);
  $("#letter-share").addEventListener("click", () => {
    const text = $("#letter-text").value;
    if (window.Fixcash?.shareText) {
      window.Fixcash.shareText("Kündigungsschreiben", text);
    } else if (navigator.share) {
      navigator.share({ title: "Kündigungsschreiben", text }).catch((error) => {
        if (error.name !== "AbortError") setNotice(`Teilen fehlgeschlagen: ${error.message}`, true);
      });
    } else {
      copyLetter();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") $("#letter-modal").classList.add("hidden");
  });

  render();
})();
