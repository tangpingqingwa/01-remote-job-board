import Script from "next/script";
import React from "react";
import {
  renderBoardPage,
  type BoardViewModel,
} from "../views/outbid-reference-board";

type RenderedDocument = {
  css: string;
  markup: string;
  scripts: string[];
};

function splitRenderedDocument(documentHtml: string): RenderedDocument {
  const style = /<style>([\s\S]*?)<\/style>/.exec(documentHtml)?.[1];
  const body = /<body>([\s\S]*?)<\/body>/.exec(documentHtml)?.[1];
  if (!style || !body) throw new Error("reference_document_invalid");
  const scripts = Array.from(
    body.matchAll(/<script>([\s\S]*?)<\/script>/g),
    (match) => match[1] ?? "",
  );
  return {
    css: style,
    markup: body.replaceAll(/<script>[\s\S]*?<\/script>/g, ""),
    scripts,
  };
}

export function adaptReferenceDocument(documentHtml: string): string {
  return documentHtml
    .replace('name="productUrl"', 'name="identity"')
    .replace('id="productUrl" name="identity" type="url"', 'id="productUrl" name="identity" type="text"')
    .replace('name="whyTestThisToday"', 'name="title"')
    .replace('name="venueName"', 'name="company"')
    .replace('name="bidUsd"', 'name="amount"')
    .replace(
      '<input id="bid" name="amount"',
      '<input type="hidden" name="lane" value="backend" data-function-lane=""/><input id="bid" name="amount"',
    )
    .replace("Product URL", "Apply URL or company handle")
    .replace("Why test this today", "Role title")
    .replace("What a seller should try this morning", "Remote role title")
    .replace(
      "A short, specific reason helps sellers decide what to test.",
      "The role title appears on the paid placement.",
    )
    .replace("Choose a category and enter venue details", "Choose a function and enter company details")
    .replace("Weekend venue details", "Company details")
    .replace("Venue details", "Company details")
    .replace("Venue name", "Company")
    .replace('placeholder="Venue name"', 'placeholder="Company name"')
    .replaceAll(/href="\/r\/([^"#?]+)"/g, 'href="/out/$1"')
    .replaceAll(/data-target="\/r\/([^"#?]+)"/g, 'data-target="/out/$1"');
}

export function OutbidReferenceFixturePage({
  model,
}: {
  model: BoardViewModel;
}) {
  const rendered = splitRenderedDocument(
    adaptReferenceDocument(renderBoardPage(model)),
  );
  const boot = `document.title = "Remote Job Board"; document.documentElement.classList.remove("dark"); try { localStorage.setItem("theme", "light"); } catch (error) {} var referenceRoot = document.querySelector(".outbid-reference-root"); if (referenceRoot) referenceRoot.addEventListener("click", function (event) { var option = event.target.closest("[data-category-option], [data-category-chip]"); if (!option) return; var label = option.getAttribute("data-category-option") || option.getAttribute("data-category-chip") || ""; var lane = referenceRoot.querySelector("[data-function-lane]"); var lanes = { Developers: "backend", Design: "design", Marketing: "growth", Growth: "growth", Analytics: "data", Agents: "devrel", Launches: "product" }; if (lane) { lane.value = lanes[label] || "backend"; lane.setAttribute("value", lane.value); } });`;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: rendered.css }} />
      <div
        className="outbid-reference-root"
        data-reference-fixture-root=""
        dangerouslySetInnerHTML={{ __html: rendered.markup }}
      />
      {rendered.scripts.map((source, index) => (
        <Script
          id={`outbid-reference-script-${index}`}
          key={`outbid-reference-script-${index}`}
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: index === 0 ? `${boot}\n${source}` : source,
          }}
        />
      ))}
    </>
  );
}
