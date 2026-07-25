import React from "react";
import { render, waitFor } from "@testing-library/react";
import SeoManager, { useSeoOverride } from "./SeoManager";

let mockPathname = "/";
jest.mock(
  "react-router-dom",
  () => ({
    useLocation: () => ({ pathname: mockPathname }),
  }),
  { virtual: true },
);

function renderAt(pathname, child = <div>Page</div>) {
  mockPathname = pathname;
  return render(<SeoManager>{child}</SeoManager>);
}

function DynamicKnifeSeo() {
  useSeoOverride({
    title: "Camp Knife | Nolan's Knives",
    description: "View the Camp Knife, its specifications, current availability, and purchase details.",
    image: "https://example.com/camp-knife.jpg",
    imageAlt: "Camp Knife handmade knife",
    canonicalPath: "/product/camp-knife",
    breadcrumbName: "Camp Knife",
    schemaType: "ItemPage",
    index: true,
  });
  return <div>Camp Knife</div>;
}

test("publishes unique metadata and a canonical URL for an indexable route", async () => {
  renderAt("/about");

  await waitFor(() => {
    expect(document.title).toBe("About Nolan's Knives | Huntsville, Alabama");
  });
  expect(document.querySelector('meta[name="robots"]')).toHaveAttribute(
    "content",
    expect.stringContaining("index,follow"),
  );
  expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://nolansknives.com/about",
  );
  expect(document.querySelector('script[data-seo-schema="true"]')?.textContent).toContain(
    '"AboutPage"',
  );
});

test("keeps private workflow routes out of search results", async () => {
  renderAt("/my-knives/example-order");

  await waitFor(() => {
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex,nofollow",
    );
  });
  expect(document.title).toBe("Your Knives | Nolan's Knives");
  expect(document.querySelector('script[data-seo-schema="true"]')).not.toBeInTheDocument();
});

test("uses loaded knife details for product metadata without product sales schema", async () => {
  renderAt("/product/camp-knife", <DynamicKnifeSeo />);

  await waitFor(() => {
    expect(document.title).toBe("Camp Knife | Nolan's Knives");
  });
  expect(document.querySelector('meta[property="og:image"]')).toHaveAttribute(
    "content",
    "https://example.com/camp-knife.jpg",
  );
  const schema = document.querySelector('script[data-seo-schema="true"]')?.textContent || "";
  expect(schema).toContain('"ItemPage"');
  expect(schema).not.toContain('"Product"');
  expect(schema).not.toContain('"Offer"');
});
