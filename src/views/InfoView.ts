export default class InfoView {
  mount(container: HTMLElement) {
    const base = import.meta.env.BASE_URL || '/'

    container.innerHTML = `
      <div class="max-w-5xl mx-auto px-4 sm:px-6 py-5 sm:py-6">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-5">
          <div>
            <div class="uppercase text-[10px] tracking-[1.5px] font-bold text-[#a1a1aa]">TECHNICAL DESIGN REVIEW</div>
            <h1 class="text-3xl font-semibold tracking-tight text-[#e4e4e7]">How Mosaic is wired</h1>
            <p class="mt-1 max-w-3xl text-sm leading-relaxed text-[#a1a1aa]">
              Static frontend, committed data, provisional Hunt and Studio operations, and GitHub-gated promotion.
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <a class="studio-secondary-link" href="${this.escapeAttr(base)}">Explore</a>
            <a class="studio-secondary-link" href="${this.escapeAttr(`${base}studio`)}">Studio</a>
          </div>
        </div>

        <div class="grid gap-4">
          ${this.section(
            'System contract',
            `
              <ul class="grid gap-2 text-sm leading-relaxed text-[#e4e4e7]">
                <li>Client is 100% static. The public site reads committed JSON from <code class="text-[#c9a86c]">public/data</code>.</li>
                <li>Research and curation are GitHub-native. Actions validate, enrich, and promote data into the committed atlas.</li>
                <li>Netlify is a provisional Hunt and Studio gateway only. It can queue jobs and hold drafts, but it does not become the source of truth.</li>
                <li>All map rendering and shell routing stay in the browser. No always-on backend is introduced in the app.</li>
              </ul>
            `
          )}

          <div class="grid gap-4 lg:grid-cols-2">
            ${this.section(
              'Data flow',
              `
                <ul class="grid gap-2 text-sm leading-relaxed text-[#e4e4e7]">
                  <li><strong class="text-[#c9a86c]">Gallery</strong> loads the committed atlas index and map summaries.</li>
                  <li><strong class="text-[#c9a86c]">Map view</strong> loads one map manifest, then entries, then renders markers and details.</li>
                  <li><strong class="text-[#c9a86c]">Studio</strong> loads committed maps, backlog flags, public hunt drafts, and research batches.</li>
                  <li><strong class="text-[#c9a86c]">Hunts</strong> are created as provisional Netlify jobs, then promoted only after validation.</li>
                </ul>
              `
            )}

            ${this.section(
              'Processing path',
              `
                <ul class="grid gap-2 text-sm leading-relaxed text-[#e4e4e7]">
                  <li><strong class="text-[#c9a86c]">Create Hunt</strong> builds a structured HuntSpec from topic + curator guidance.</li>
                  <li><strong class="text-[#c9a86c]">Draft / iterate</strong> stays provisional and may use Grok for refinement.</li>
                  <li><strong class="text-[#c9a86c]">Approve</strong> creates a review payload with target state, reason, note, and action mode.</li>
                  <li><strong class="text-[#c9a86c]">Promotion</strong> remains a separate gate: exact address, valid coordinates, current evidence, real photos.</li>
                </ul>
              `
            )}
          </div>

          ${this.section(
            'What happens when you press Approve in Studio',
            `
              <ol class="grid gap-2 text-sm leading-relaxed text-[#e4e4e7] list-decimal pl-5">
                <li>The selected review card is converted into a deterministic JSON payload.</li>
                <li>The payload includes map slug, entry id, action type, target state, note, timestamp, and whether the user chose live or batch mode.</li>
                <li>The app sends that payload to the protected Studio queue when the curator key is accepted.</li>
                <li>If the service is unavailable, the payload can still be copied for later submission.</li>
                <li>Approve does not publish public data directly. Public writes still require GitHub validation and promotion rules.</li>
              </ol>
            `
          )}

          <div class="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            ${this.section(
              'Requirements and expectations',
              `
                <ul class="grid gap-2 text-sm leading-relaxed text-[#e4e4e7]">
                  <li>Use exact street addresses and coordinates that match the entry.</li>
                  <li>Prefer current or recent evidence over stale historical references.</li>
                  <li>Reject stock imagery, generic storefronts, or chain filler unless explicitly requested.</li>
                  <li>Real photos should be tied to the actual place and visible in the evidence trail.</li>
                  <li>Any provisional output must stay visibly provisional until it passes promotion.</li>
                </ul>
              `
            )}

            ${this.section(
              'Key modules',
              `
                <ul class="grid gap-2 text-sm leading-relaxed text-[#e4e4e7]">
                  <li><code class="text-[#c9a86c]">src/lib/router.ts</code> owns route parsing and History API navigation.</li>
                  <li><code class="text-[#c9a86c]">src/lib/data-loader.ts</code> centralizes data access for maps, hunts, and batches.</li>
                  <li><code class="text-[#c9a86c]">src/lib/assistant.ts</code> handles Hunt and Studio API calls plus curator key state.</li>
                  <li><code class="text-[#c9a86c]">src/views/StudioView.ts</code> builds the review workspace and payloads.</li>
                  <li><code class="text-[#c9a86c]">src/views/HuntView.ts</code> shows provisional drafts and promotion controls.</li>
                </ul>
              `
            )}
          </div>
        </div>
      </div>
    `
  }

  private section(title: string, body: string) {
    return `
      <section class="mosaic-card p-4 sm:p-5">
        <div class="uppercase text-[10px] tracking-[1.5px] font-bold text-[#a1a1aa] mb-2">${this.escapeHtml(title)}</div>
        ${body}
      </section>
    `
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }

  private escapeAttr(value: string) {
    return this.escapeHtml(value)
  }
}
