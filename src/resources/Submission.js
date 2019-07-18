'use strict'

const FormioUtils = require('formiojs/utils');
const _ = require('lodash');
const vm = require('vm');
const Validator = require('../libraries/Validator');
const Resource = require('../libraries/Resource');
const log = require('../log');

module.exports = class Submission extends Resource {
  constructor(model, router, app) {
    super(model, router, app);
  }

  get route() {
    return this.path('/form/:formId/' + this.name);
  }

  get actions() {
    return this.app.actions;
  }

  getQuery(req, query = {}) {
    query.form = this.model.toID(req.params.formId);
    return super.getQuery(req, query);
  }

  index(req, res, next) {
    log('debug', 'submission index called');
    this.callPromisesAsync([
      this.executeSuper.bind(this, 'index', req, res),
      this.executeFieldHandlers.bind(this, 'afterActions', 'index', req, res),
    ])
      .then(() => {
        log('debug', 'submission index done');
        return next();
      })
      .catch(err => next(err));
  }

  post(req, res, next) {
    log('debug', 'submission post called');
    this.callPromisesAsync([
      this.initializeSubmission.bind(this, req, res),
      this.executeFieldHandlers.bind(this, 'beforeValidate', 'post', req, res),
      this.validateSubmission.bind(this, req, res),
      this.executeFieldHandlers.bind(this, 'afterValidate', 'post', req, res),
      this.executeActions.bind(this, 'before', 'create', req, res),
      this.executeSuper.bind(this, 'post', req, res),
      this.executeActions.bind(this, 'after', 'create', req, res),
      this.executeFieldHandlers.bind(this, 'afterActions', 'post', req, res),
    ])
      .then(() => {
        log('debug', 'submission post done');
        return next();
      })
      .catch(err => next(err));
  }

  get(req, res, next) {
    log('debug', 'submission get called');
    this.callPromisesAsync([
      this.executeSuper.bind(this, 'get', req, res),
      this.executeFieldHandlers.bind(this, 'afterActions', 'get', req, res),
    ])
      .then(() => {
        log('debug', 'submission get done');
        return next();
      })
      .catch(err => next(err));
  }

  put(req, res, next) {
    log('debug', 'submission put called');
    this.callPromisesAsync([
      this.initializeSubmission.bind(this, req, res),
      this.executeFieldHandlers.bind(this, 'beforeValidate', 'put', req, res),
      this.validateSubmission.bind(this, req, res),
      this.executeFieldHandlers.bind(this, 'afterValidate', 'put', req, res),
      this.executeActions.bind(this, 'before', 'update', req, res),
      this.executeSuper.bind(this, 'put', req, res),
      this.executeActions.bind(this, 'after', 'update', req, res),
      this.executeFieldHandlers.bind(this, 'afterActions', 'put', req, res),
    ])
      .then(() => {
        log('debug', 'submission put done');
        return next();
      })
      .catch(err => next(err));
  }

  patch(req, res, next) {
    log('debug', 'submission patch called');
    this.callPromisesAsync([
      this.initializeSubmission.bind(this, req, res),
      this.executeFieldHandlers.bind(this, 'beforeValidate', 'patch', req, res),
      this.validateSubmission.bind(this, req, res),
      this.executeFieldHandlers.bind(this, 'afterValidate', 'patch', req, res),
      this.executeActions.bind(this, 'before', 'update', req, res),
      this.executeSuper.bind(this, 'put', req, res),
      this.executeActions.bind(this, 'after', 'update', req, res),
      this.executeFieldHandlers.bind(this, 'afterActions', 'patch', req, res),
    ])
      .then(() => {
        log('debug', 'submission patch done');
        return next();
      })
      .catch(err => next(err));
  }

  delete(req, res, next) {
    log('debug', 'submission delete called');
    this.callPromisesAsync([
      this.executeSuper.bind(this, 'delete', req, res),
      this.executeFieldHandlers.bind(this, 'afterActions', 'delete', req, res),
    ])
      .then(() => {
        log('debug', 'submission delete done');
        return next();
      })
      .catch(err => next(err));
  }

  getBody(req) {
    const {data, owner, access, metadata} = req.body;

    return {
      data,
      owner,
      access,
      metadata,
    }
  }

  initializeSubmission(req, res) {
    log('initializeSubmission');
    req.skipResource = true;

    req.body = this.getBody(req);

    // Ensure there is always a data body.
    req.body.data = req.body.data || {};

    // Ensure they cannot reset the submission id.
    if (req.context.params.hasOwnProperty('submission')) {
      req.body._id = req.context.params['submission'];
    }

    // Always make sure form is set correctly.
    req.body.form = req.context.params['form'];

    // Copy roles from existing submissions so they arent lost.
    if (req.context.resources.submission) {
      req.body.roles = req.context.resources.submission.roles;
    }

    // Ensure response is set.
    res.resource = {
      item: req.body
    };

    // Save off original submission.
    req.submission = _.cloneDeep(req.body);

    return Promise.resolve();
  }

  validateSubmission(req, res) {
    log('debug', 'validateSubmission');
    return new Promise((resolve, reject) => {
      const validator = new Validator(req.context.resources.form, this.app.models.Submission, req.token);
      validator.validate(req.body, (err, data) => {
        if (err) {
          return res.status(400).json(err);
        }

        req.body.data = data;
        log('debug', 'validateSubmission done');
        resolve();
      });
    });
  }

  executeActions(handler, method, req, res) {
    log('debug', 'executeActions', handler, method);
    const actions = [];
    req.context.actions.forEach(action => {
      if (action.method.includes(method) && action.handler.includes(handler)) {
        const context = {
          jsonLogic: FormioUtils.jsonLogic,
          data: req.body.data,
          form: req.context.resources.form,
          query: req.query,
          util: FormioUtils,
          _,
          execute: false
        };

        if (this.shouldExecute(action, context)) {
          actions.push(() => {
            return this.app.models.ActionItem.create({
              title: action.title,
              form: req.params.formId,
              submission: req.params.submissionId || req.body._id,
              action: action.name,
              handler,
              method,
              state: 'new',
              messages: [
                {
                  datetime: new Date(),
                  info: 'New Action Triggered',
                  data: {}
                }
              ]
            })
              .then(actionItem => {
                const setActionItemMessage = (message, data = {}, state = null) => {
                  actionItem.messages.push({
                    datetime: new Date(),
                    info: message,
                    data
                  });

                  if (state) {
                    actionItem.state = state;
                  }

                  this.app.models.ActionItem.update(actionItem);
                };
                // If action exists on this server, execute immediately.
                if (this.actions.submission.hasOwnProperty(action.name)) {
                  setActionItemMessage('Starting Action', {}, 'inprogress');
                  const instance = new this.actions.submission[action.name](this.app, action.settings);
                  return instance.resolve(handler, method, req, res, setActionItemMessage)
                    .then(() => {
                      setActionItemMessage('Action Resolved (no longer blocking)', {}, 'complete');
                    })
                    .catch(error => {
                      setActionItemMessage('Error Occurred', error, 'error');
                    });
                }
              });
          })
        }
      }
    });
    return this.callPromisesAsync(actions);
  }

  shouldExecute(action, context) {
    const condition = action.condition;
    if (!condition) {
      return true;
    }

    if (condition.custom) {
      let json = null;
      try {
        json = JSON.parse(action.condition.custom);
      } catch (e) {
        json = null;
      }

      try {
        const script = new vm.Script(json
          ? `execute = jsonLogic.apply(${condition.custom}, { data, form, _, util })`
          : condition.custom);

        script.runInContext(vm.createContext(context), {
          timeout: 500
        });

        return sandbox.execute;
      } catch (err) {
        return false;
      }
    } else {
      if (_.isEmpty(condition.field) || _.isEmpty(condition.eq)) {
        return true;
      }

      // See if a condition is not established within the action.
      const field = condition.field || '';
      const eq = condition.eq || '';
      const value = String(_.get(context, `data.${field}`, ''));
      const compare = String(condition.value || '');

      // Cancel the action if the field and eq aren't set, in addition to the value not being the same as compare.
      return (eq === 'equals') ===
        ((Array.isArray(value) && value.map(String).includes(compare)) || (value === compare));
    }
  }

  executeFieldHandlers(handler, action, req, res) {
    const form = req.context.resources.form;
    let submissions = [];
    if (res.resource && res.resource.items) {
      submissions = res.resource.items;
    } else if (res.resource && res.resource.item) {
      submissions = [res.resource.item];
    } else {
      submissions = [req.body];
    }

    return Promise.all(submissions.map((submission) => {
      return this.eachValue(form.components, submission.data, (context) => {
        const promises = [];

        const {component, data, handler, action, path} = context;

        // Execute field actions
        if (this.actions.field.hasOwnProperty(component.type)) {
          promises.push(this.actions.field[component.type](component, data, handler, action, {
            path,
            req,
            res,
            app: this
          }));
        }

        // Execute property actions.
        Object.keys(this.actions.property).forEach((property) => {
          if (component.hasOwnProperty(property) && component[property]) {
            promises.push(this.actions.property[property](component, data, handler, action, {req, res, app: this}));
          }
        });

        return Promise.all(promises);
      }, {handler, action, req, res});
    }));
  }

  /**
   * This function will iterate over each value for each component. This means that for each row of a datagrid it will
   * call the callback once for each row's component.
   *
   * @param components
   * @param data
   * @param fn
   * @param context
   * @param path
   * @returns {Promise<any[]>}
   */
  eachValue(components, data, fn, context, path = '') {
    const promises = [];

    components.forEach(component => {
      if (component.hasOwnProperty('components') && Array.isArray(component.components)) {
        // If tree type is an array of objects like datagrid and editgrid.
        if (['datagrid', 'editgrid'].includes(component.type) || component.arrayTree) {
          _.get(data, component.key, []).forEach((row, index) => {
            promises.push(this.eachValue(
              component.components,
              row,
              fn,
              context,
              path ? `${path}.` : '' + `${component.key}[${index}]`
            ));
          })
        }
        // If it is a form
        else if (['form'].includes(component.type)) {
          promises.push(this.eachValue(
            component.components,
            _.get(data, `${component.key}.data`, {}),
            fn,
            context,
            path ? `${path}.` : '' + `${component.key}.data`
          ));

        }
        // If tree type is an object like container.
        else if (
          ['container'].includes(component.type) ||
          (component.tree && !['panel', 'table', 'well', 'columns', 'fieldset', 'tabs', 'form'].includes(component.type))
        ) {
          promises.push(this.eachValue(
            component.components,
            _.get(data, component.key),
            fn,
            context,
            path ? `${path}.` : '' + `${component.key}`
          ));
        }
        // If this is just a layout component.
        else {
          promises.push(this.eachValue(component.components, data, fn, context, path));
        }
      } else if (component.hasOwnProperty('columns') && Array.isArray(component.columns)) {
        // Handle column like layout components.
        component.columns.forEach((column) => {
          promises.push(this.eachValue(column.components, data, fn, context, path));
        });
      } else if (component.hasOwnProperty('rows') && Array.isArray(component.rows)) {
        // Handle table like layout components.
        component.rows.forEach((row) => {
          if (Array.isArray(row)) {
            row.forEach((column) => {
              promises.push(this.eachValue(column.components, data, fn, context, path));
            });
          }
        });
      } else {
        // If this is just a regular component, call the callback.
        promises.push(fn({...context, data, component, path}));
      }
    });

    return Promise.all(promises);
  }

  executeSuper(name, req, res) {
    log('debug', 'executeSuper', name);
    // If we are supposed to skip resource, do so.
    if (req.skipResource) {
      log('debug', 'skipResource');
      return Promise.resolve();
    }

    // Call the Resource method.
    return new Promise((resolve, reject) => {
      super[name](req, res, (err) => {
        log('debug', 'executeSuper done');
        if (err) {
          return reject(err);
        }
        return resolve();
      });
    });
  }
};
