import React, { useEffect } from 'react';
import { Carousel, CarouselItem, CarouselCaption } from 'react-bootstrap';
import "./main.css";

function TimedCarousel({ items }) {
    const hasItems = Boolean(items && items.length > 0);

    useEffect(() => {
        if (!hasItems) return;
        const handleScroll = () => {
            const indicator = document.getElementById("indicator");
            if (indicator) {
                if (window.scrollY > 50) {
                    indicator.style.opacity = "0";
                    indicator.style.pointerEvents = "none";
                } else {
                    indicator.style.opacity = "1";
                    indicator.style.pointerEvents = "auto";
                }
            }
        };

        handleScroll();
        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => window.removeEventListener("scroll", handleScroll);
    }, [hasItems]);

    if (!hasItems) return null;

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
                        style={{ height: '100vh', objectFit: 'cover' }}
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
