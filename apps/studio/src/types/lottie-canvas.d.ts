declare module 'lottie-web/build/player/lottie_canvas.min.js' {
  const lottieCanvas: {
    loadAnimation: (params: Record<string, unknown>) => {
      goToAndStop: (frame: number, isFrame?: boolean) => void;
      destroy: () => void;
      totalFrames: number;
    };
  };
  export default lottieCanvas;
}
