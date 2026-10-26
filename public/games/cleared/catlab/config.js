export const config = {
  defaultCat: {
    headColor: '#FFE135', // yellow
    earColor: '#FF0000',  // red
    eyeColor: '#00FF00'   // green
  },
  
  maxCats: 10,
  maxExperiments: 5,
  eggHatchTime: 10000, // 10 seconds
  
  colorVariation: 30, // Maximum color variation for breeding/experiments
  numberOfKittens: 3,
  mutationChance: 0.02, // 2% chance for radical color change
  maxSuperExperiments: 2,
  superColorVariation: 60,
  superMutationChance: 0.2,
  foodBoostMultiplier: 1.5,
  initialFood: 5,
  tradeValues: {
    cat: 5,
    experiments: 3,
    superExperiments: 4
  }
};