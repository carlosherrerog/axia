import React from 'react';

export const NavTabContext = React.createContext({
  activeTab:   null,
  onTabPress:  () => {},
  tabs:        [],
});
