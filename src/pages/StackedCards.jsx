import { Image, Card, Button } from 'react-bootstrap';
import { Link } from "react-router-dom";
import { useLayoutEffect, useRef, useState } from 'react';

import "./main.css";

const MOBILE_QUERY = '(max-width: 900px)';
// Real knife photography is landscape; anything squarer/taller than this is a
// logo or thumbnail graphic that shouldn't be force-cropped to fill the frame.
const LANDSCAPE_RATIO_THRESHOLD = 1.15;

function useEqualMobileCardHeight(items) {
    const cardRefs = useRef([]);
    const [height, setHeight] = useState(null);

    useLayoutEffect(() => {
        cardRefs.current = cardRefs.current.slice(0, items.length);
        setHeight(null);
    }, [items]);

    useLayoutEffect(() => {
        if (height !== null) return;
        if (!window.matchMedia(MOBILE_QUERY).matches) return;

        const heights = cardRefs.current.filter(Boolean).map((el) => el.offsetHeight);
        if (heights.length) setHeight(Math.max(...heights));
    }, [height, items]);

    useLayoutEffect(() => {
        let resizeTimer;
        const handleResize = () => {
            window.clearTimeout(resizeTimer);
            resizeTimer = window.setTimeout(() => setHeight(null), 150);
        };

        window.addEventListener('resize', handleResize);
        return () => {
            window.clearTimeout(resizeTimer);
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    return { cardRefs, equalHeight: window.matchMedia(MOBILE_QUERY).matches ? height : null };
}

function StackedCards({ items }) {
    const { cardRefs, equalHeight } = useEqualMobileCardHeight(items || []);
    const [containImages, setContainImages] = useState({});

    const evaluateImageFit = (index, imgEl) => {
        const { naturalWidth, naturalHeight } = imgEl;
        if (!naturalWidth || !naturalHeight) return;

        const isNonLandscape = naturalWidth / naturalHeight < LANDSCAPE_RATIO_THRESHOLD;
        setContainImages((prev) => (prev[index] === isNonLandscape ? prev : { ...prev, [index]: isNonLandscape }));
    };

    if (!items || items.length === 0) {
        return <div className="stacked-cards-wrapper"></div>;
    }

    return (
        <section className="stacked-cards-wrapper" aria-label="Explore Nolan's Knives">
            {items.map((item, index) => {
                const isExternal = /^https?:\/\//i.test(item.href || '');
                const buttonProps = isExternal
                    ? { as: 'a', href: item.href, target: '_blank', rel: 'noreferrer' }
                    : { as: Link, to: item.href || '/store' };

                return (
                    <Card
                        key={item.id || `${item.title}-${index}`}
                        ref={(el) => { cardRefs.current[index] = el; }}
                        className="stacked-card"
                        style={{ "--stack-index": index, minHeight: equalHeight ? `${equalHeight}px` : undefined }}
                    >
                        <div className="stacked-card-text">
                            <h2>{item.title}</h2>
                            <p>{item.text}</p>
                            <Button variant="outline-light" className="stacked-card-button" {...buttonProps}>{item.hrefText}</Button>
                        </div>
                        {item.src && (
                            <Image
                                src={item.src}
                                alt={item.title}
                                className={`stacked-card-image ${containImages[index] ? 'stacked-card-image-contain' : ''}`}
                                ref={(el) => { if (el && el.complete) evaluateImageFit(index, el); }}
                                onLoad={(event) => evaluateImageFit(index, event.target)}
                            />
                        )}
                    </Card>
                );
            })}
        </section>
    );
}

export default StackedCards;
