const BRIGHT_GREEN = '#28FC91';
const DARK_GREEN = '#0F2218';
const TEXT_GREEN = '51, 255, 0';

exports.decorateConfig = (config) => {
  return Object.assign({}, config, {
    foregroundColor: BRIGHT_GREEN,
    backgroundColor: DARK_GREEN,
    borderColor: BRIGHT_GREEN,
    cursorColor: '#40FFFF',
  });
}

exports.decorateHyper = (HyperTerm, { React, notify }) => {
  return class extends React.Component {
    constructor(props, context) {
      super(props, context);
    }

    render() {
      const overridenProps = {
        backgroundColor: 'black',
        customCSS: `
          ${this.props.customCSS || ''}
          .tabs_nav .tabs_title {
            color: rgb(${TEXT_GREEN}) !important;
            font-weight: bold !important;
            animation: textShadow 1.6s infinite;
          }
          .tabs_list {
            background-color: ${DARK_GREEN} !important;
            background-image: none !important;
          }
          .tab_tab {
            border: 3px dashed rgb(${TEXT_GREEN});
            height: 40px;
          }
          .tab_tab:not(.tab_active) {
            color: rgba(${TEXT_GREEN}, 0.7);
          }
          .tab_tab.tab_active {
            animation: textShadow 1.6s infinite;
            font-weight: bold;
            color: rgb(${TEXT_GREEN});
            border: 3px double rgb(${TEXT_GREEN});
          }
          .terms_termsShifted {
            margin-top: 74px;
          }
          .tab_icon {
            color: rgb(${TEXT_GREEN});
            font-style: normal;
            line-height: 14px;
          }
          .tab_icon:before {
            content: "\u2716"
          }
          .tab_icon:hover {
            background-color: transparent;
          }
          .tab_shape {
            display: none;
          }
        `,
      };
      return React.createElement(HyperTerm, Object.assign({}, this.props, overridenProps));
    }
  }
}

exports.decorateTerm = (Term, { React, notify }) => {
  return class extends React.Component {
    constructor (props, context) {
      super(props, context);
    }

    render () {
      const overridenProps = {
        customCSS: `
        ${this.props.customCSS || ''}
      `};
      return React.createElement(Term, Object.assign({}, this.props, overridenProps));
    }
  }
};
