import 'bootstrap/dist/css/bootstrap.min.css';
import "./main.css"
import { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { db } from './firebase';

import TimedCarousel from "./TimedCarousel"
import StackedCards from "./StackedCards"
import AutoScrollToTop from './autoScrollToTop';

const items = [
  {name: "QUALITY", interval: 4500, src: "https://raw.githubusercontent.com/nolansknives/website-database/refs/heads/main/images/knife2.jpg", caption: "Handmade knives shaped for purpose, built one at a time, and made to last."},
  {name: "DURABILITY", interval: 4000, src: "https://raw.githubusercontent.com/nolansknives/website-database/refs/heads/main/images/knife4.jpg", caption: "Made for the hand, the task, and years of honest use."},
  {name: "ARTISTRY", interval: 4000, src: "https://raw.githubusercontent.com/nolansknives/website-database/refs/heads/main/images/knife7.jpg", caption: "One-of-a-kind details shaped by fire, steel, and patience."}
];

const fallbackCards = [
  {title: "Available Work", text: "Finished handmade knives with clear photography, pricing, materials, and availability.", hrefText: "Shop available knives", href: "/Store", src: "https://raw.githubusercontent.com/nolansknives/website-database/refs/heads/main/images/knife6.jpg"},
  {title: "Built Around You", text: "Choose the purpose, profile, steel, handle, finish, and personal details. Nolan turns the brief into a practical quote and build plan.", hrefText: "Start a custom request", href:"/custom-knife-request", src: "https://raw.githubusercontent.com/nolansknives/website-database/refs/heads/main/images/knife5.jpg"},
  {title: "Past Work", text: "Browse finished pieces, workshop experiments, and past builds for inspiration.", hrefText: "Explore the gallery", href:"/Gallery", src: "https://raw.githubusercontent.com/nolansknives/website-database/refs/heads/main/images/knife8.jpg"},
  {title: "Meet the Maker", text: "A self-taught bladesmith focused on learning, improving, and making every knife better than the last.", hrefText: "About Nolan", href: "/about", src: "https://raw.githubusercontent.com/nolansknives/website-database/refs/heads/main/images/knife4.jpg"}
];

export default function Home() {
  const [cards, setCards] = useState(fallbackCards);
  const [carouselItems, setCarouselItems] = useState(items);

  useEffect(() => {
    const homeRef = ref(db, 'Home');
    const unsubscribe = onValue(homeRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setCards(fallbackCards);
        return;
      }

      const fromDb = Object.entries(data).filter(([, value]) => Boolean(value)).map(([id, value]) => ({
        id,
        ...value,
        // If a legacy entry stores multiple images, keep first for stacked card layout.
        src: Array.isArray(value?.src) ? value.src[0] : value?.src
      }))
        .filter((item) => item.isVisible !== false)
        .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || (a.title || "").localeCompare(b.title || ""));

      setCards(fromDb.length > 0 ? fromDb : fallbackCards);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const carouselRef = ref(db, 'HomeCarousel');
    const unsubscribe = onValue(carouselRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setCarouselItems(items);
        return;
      }

      const fromDb = Object.entries(data)
        .filter(([, value]) => Boolean(value) && value.isVisible !== false)
        .map(([id, value]) => ({
          id,
          name: value.name || value.title || '',
          interval: Number(value.interval || 3500),
          src: Array.isArray(value.src) ? value.src[0] : value.src,
          caption: value.caption || '',
          sortOrder: value.sortOrder
        }))
        .filter((item) => item.src)
        .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || (a.name || '').localeCompare(b.name || ''));

      setCarouselItems(fromDb.length > 0 ? fromDb : items);
    });

    return () => unsubscribe();
  }, []);

  return (
    <div id="MainContainerDiv">
      <AutoScrollToTop />
      <TimedCarousel items={carouselItems} />
      <StackedCards items={cards}/>
    </div>
  );
}
