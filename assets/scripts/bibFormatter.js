async function loadAndFormatBib(bibFile, targetElementId) {
    try {
      const response = await fetch(bibFile);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const bibText = await response.text();
      const entries = parseBibTex(bibText);
      const formattedBibliography = formatBibToIEEE(entries);
      document.getElementById(targetElementId).innerHTML = formattedBibliography;
    } catch (error) {
      console.error("Could not load or process .bib file:", error);
      document.getElementById(targetElementId).innerText = "Error loading publications.";
    }
  }
  function parseBibTex(bibText) {
    const entries = [];
    const items = bibText.trim().split('@'); // Trim leading whitespace and split
    for (let i = 1; i < items.length; i++) { // Start from index 1 to skip the initial empty string
      const entryText = items[i].trim();
      if (entryText.length > 0) {
        const firstBracketIndex = entryText.indexOf("{");
        if (firstBracketIndex > 0) {
          const type = entryText.substring(0, firstBracketIndex).trim().toLowerCase();
          const remainingText = entryText.substring(firstBracketIndex + 1);
          const commaIndex = remainingText.indexOf(",");
          if (commaIndex > 0) {
            const key = remainingText.substring(0, commaIndex).trim();
            const fieldsText = remainingText.substring(commaIndex + 1, remainingText.lastIndexOf("}")).trim();
            const fields = {};
            const fieldRegex = /(\w+)\s*=\s*\{(.*?)\}(?:,|\s*\})/g;
            let fieldMatch;
            while ((fieldMatch = fieldRegex.exec(fieldsText)) !== null) {
              const fieldName = fieldMatch[1].toLowerCase();
              const fieldValue = fieldMatch[2].trim();
              fields[fieldName] = fieldValue.replace(/[{}]/g, '');
            }
            entries.push({ type, key, fields });
          }
        }
      }
    }
    return entries;
  }
  
  function formatBibToIEEE(entries) {
    let html = '<ol class="bibliography">';
    entries.forEach(entry => {
        if (!entry.fields.author) {
            console.log(entry)
          console.warn(`Missing author in entry: ${entry.key}`);
        }
        if (!entry.fields.title) {
          console.warn(`Missing title in entry: ${entry.key}`);
        }
      });
    entries.forEach(entry => {
      let authors = entry.fields.author ? entry.fields.author.split(' and ').map(author => author.trim()).join(', ') : 'Unknown Author';
      let title = entry.fields.title ? entry.fields.title.replace(/[{}]/g, '') : 'Unknown Title';
      let journal = entry.fields.journal ? `<em class="journal">${entry.fields.journal.replace(/[{}]/g, '')}</em>` : '';
      let conference = entry.fields.booktitle ? `<em class="conference">${entry.fields.booktitle.replace(/[{}]/g, '')}</em>` : '';
      let year = entry.fields.year ? `<span class="year">(${entry.fields.year})</span>` : '';
      let pages = entry.fields.pages ? `, pp. ${entry.fields.pages}` : '';
      let volume = entry.fields.volume ? `, vol. ${entry.fields.volume}` : '';
      let number = entry.fields.number ? `, no. ${entry.fields.number}` : '';
  
      let citation = `<li class="bib-entry"><span class="author"><span class="math-inline">${authors}</span\>, "</span>${title}," `;
      if (journal) {
        citation += `<span class="math-inline">${journal}</span>{volume}<span class="math-inline">${number}</span>{pages}, ${year}.`;
      } else if (conference) {
        citation += `<span class="math-inline">${conference}</span>${pages}, ${year}.`;
      } else {
        citation += `${year}.`;
      }
      citation += '</li>';
      html += citation;
    });
    html += '</ol>';
    return html;
  }