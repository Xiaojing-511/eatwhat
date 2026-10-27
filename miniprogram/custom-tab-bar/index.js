Component({
  data: {
    hidden: false,
    selected: 0,
    tabs: [
      {
        pagePath: "/pages/home/index",
        icon: "/images/home.png",
        activeIcon: "/images/home-click.png",
      },
      {
        pagePath: "/pages/mine/index",
        icon: "/images/user.png",
        activeIcon: "/images/user-click.png",
      },
    ],
  },

  methods: {
    onSwitch(event) {
      const index = Number(event.currentTarget.dataset.index);
      const tab = this.data.tabs[index];
      if (!tab || this.data.hidden) return;
      if (index === this.data.selected) return;
      wx.switchTab({ url: tab.pagePath });
    },
  },
});
