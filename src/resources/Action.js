'use strict'

const Resource = require('../libraries/Resource');
const actions = require('../actions');
const {eachComponent} = require('../libraries/Util');

module.exports = class Action extends Resource {
  constructor(model, router, app) {
    super(model, router, app);
    this.register('get', '/form/:formId/actions/:name', 'actionSettings');
    this.register('get', '/form/:formId/actions', 'actionsIndex');
  }

  get route() {
    return this.path('/form/:formId/' + this.name);
  }

  get actions() {
    return actions;
  }

  getQuery(req, query = {}) {
    query.form = this.model.toID(req.params.formId);
    return super.getQuery(req, query);
  }

  actionsIndex(req, res, next) {
    const actions = [];
    for (const key in this.actions) {
      actions.push(this.getActionInfo(this.actions[key]));
    }
    res.send(actions);
  }

  getActionInfo(action) {
    const info = action.info();
    info.defaults = Object.assign(info.defaults || {}, {
      priority: info.priority || 0,
      name: info.name,
      title: info.title
    });

    return info;
  }

  actionSettings(req, res, next) {
    const action = req.params.name;
    const components = [];

    eachComponent(req.context.resources.form.components, component => {
      components.push({
        key: component.key,
        label: component.label || component.title || component.legend
      })
    });
    const options = {
      baseUrl: this.path('/form'),
      components,
      componentsUrl: this.path(`/form/${req.params.formId}/components`)
    };
    if (action && this.actions[action]) {
      const info = this.getActionInfo(this.actions[action]);
      options.info = info;
      info.settingsForm = {
        action: this.path(`/form/${req.params.formId}/action`),
        components: this.actions[action].settingsForm(options)
      };
      res.json(info);
    }
    else {
      next(new Error('Action not found'));
    }
  }
};
