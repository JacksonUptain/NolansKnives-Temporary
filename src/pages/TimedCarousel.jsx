import { Carousel, CarouselItem, CarouselCaption } from 'react-bootstrap';
import "./main.css"
function TimedCarousel({ items }) {
    if (!items || items.length === 0) {
        return null; // Render nothing if there are no items
    }
    window.addEventListener("scroll", () => {
        const indicator = document.getElementById("indicator");
        if(window.scrollY > 50 && indicator){
            indicator.style.opacity = "0";
            indicator.style.pointerEvents = "none";
            
        }
    });

    return (
        <Carousel
            style={{
                backgroundColor: "black",
                position: "sticky",
                top: "0px",
                height: "100vh",
            }}
        >
            {items.map((item, index) => (
                <CarouselItem key={index} interval={item.interval}>
                <img
                    className="d-block w-100"
                    src={item.src}
                    alt={item.name}
                />
                <CarouselCaption>
                    <h3>{item.name}</h3>
                    
                </CarouselCaption>
                <div className="scroll-indicator" id="indicator">
                    <div className="mouse">
                        <div className="wheel"></div>
                    </div>
                    <p>SCROLL</p>
                </div>
                </CarouselItem>
            ))}
        </Carousel>


    );
}

export default TimedCarousel;
