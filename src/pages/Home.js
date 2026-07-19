
import 'bootstrap/dist/css/bootstrap.min.css';
import "./main.css"
import { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
import { db } from './firebase';

import TimedCarousel from "./TimedCarousel"
import StackedCards from "./StackedCards"
import AutoScrollToTop from './autoScrollToTop';
import { MobileOnly, NonMobileOnly } from "./MobileOnly";


const items = [{name: "QUALITY", interval: 4500, src: "https://raw.githubusercontent.com/nolansknives/website-database/refs/heads/main/images/knife2.jpg", caption: " "}, 
  {name: "DURABILITY", interval: 3000, src: "https://raw.githubusercontent.com/nolansknives/website-database/refs/heads/main/images/knife4.jpg", caption: " "}, 
  {name: "ARTISTRY", interval: 3000, src: "https://raw.githubusercontent.com/nolansknives/website-database/refs/heads/main/images/knife7.jpg", caption: " "}];




export default function Home() {
  
  const [cards, setCards] = useState([]);
  
    useEffect(() => {
    
      const productsRef = ref(db, 'Home');
      const unsubscribe = onValue(productsRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const productArray = Object.entries(data).map(([id, value]) => ({
            id,
            ...value
          }));
          setCards(productArray);
        } else {
          setCards([]);
        }
      });
  
      return () => unsubscribe();
    }, []);


    // call any function that uses them
    return (
    <>
    <h1 style={{display: 'none'}}>Home | Nolan's Knives</h1>
    <div id="MainContainerDiv">
      <head><title>Home | Nolan's Knives</title><meta name="description" content="Handmade custom knives crafted with precision and durability. Shop Nolans Knives." /></head>
      <h1 id="main-title">Nolan's Knives</h1>
      <MobileOnly>
        <p>Mobile content</p>
      </MobileOnly>
      <NonMobileOnly>
        <AutoScrollToTop />
        <TimedCarousel items={items} />
        <StackedCards items={cards}/>
      </NonMobileOnly>
      
    </div>
    </>
  );
 


  
}

