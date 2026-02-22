


              var _policies = [];
              var _assignments = [];
              var _currentPolicyId = null;

              function doOnLoadPolicy() {
            if (!window.opener || !parent || !parent.meshserver) {
                document.body.innerHTML = "<h3>Error: Unable to connect to MeshCentral Server.</h3>";
              return;
            }
              populateScriptDropdowns();
              refreshData();
        }

              function refreshData() {
                parent.meshserver.send({ action: 'plugin', plugin: 'scripttask', pluginaction: 'getPolicies' });
        }

              // Called by window.opener
              function loadPolicyData(policies, assignments, error) {
            if (error) {
                document.getElementById('tblPoliciesBody').innerHTML = '<tr><td colspan="5" style="color:red; font-weight:bold;">Error Loading Policies: ' + error + '</td></tr>';
              return;
            }
              _policies = policies || [];
              _assignments = assignments || [];
              renderPolicies();
              if (_currentPolicyId) {
                viewAssignments(_currentPolicyId);
            }
        };

              function populateScriptDropdowns() {
            var selD = document.getElementById('pDetect');
              var selR = document.getElementById('pRemediate');
              selD.innerHTML = '<option value="">(Select Detection Script)</option>';
              selR.innerHTML = '<option value="">(None - Detection Only)</option>';

              var sTree = scriptTree || [];
              sTree.forEach(function (s) {
                if (s.type === 'script') {
                selD.options.add(new Option(s.name, s._id));
              selR.options.add(new Option(s.name, s._id));
                }
            });
        }

              function getScriptName(id) {
            if (!id) return "None";
              var sTree = scriptTree || [];
            var s = sTree.find(x => x._id === id);
              return s ? s.name : "Unknown (" + id + ")";
        }

              function renderPolicies() {
            var tbody = document.getElementById('tblPoliciesBody');
              tbody.innerHTML = '';
              if (_policies.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5">No policies found.</td></tr>';
              return;
            }

              _policies.forEach(function (p) {
                var tr = document.createElement('tr');
              tr.innerHTML = `
              <td><b>${p.name}</b><br /><small>v${p.version || 1}</small></td>
              <td>${p.enabled ? 'Yes' : 'No'}</td>
              <td>${getScriptName(p.detectScriptId)}</td>
              <td>${getScriptName(p.remediateScriptId)}</td>
              <td>
                <span class="flink" onclick="viewAssignments('${p._id}', '${p.name.replace(/'/g, "\\'")}');">Assignments</span> |
              <span class="flink" onclick="showEditForm('${p._id}');">Edit</span> |
              <span class="flink" style="color:#f88" onclick="deletePolicy('${p._id}');">Delete</span>
            </td>
          `;
                tbody.appendChild(tr);
            });
        }

        function showEditForm(id) {
            document.getElementById('colEdit').classList.remove('hidden');
            document.getElementById('colAssign').classList.add('hidden');

            if (id) {
                var p = _policies.find(x => x._id === id);
                document.getElementById('editTitle').innerText = 'Edit Policy';
                document.getElementById('pId').value = p._id;
                document.getElementById('pName').value = p.name;
                document.getElementById('pEnabled').checked = p.enabled;
                document.getElementById('pDetect').value = p.detectScriptId || '';
                document.getElementById('pRemediate').value = p.remediateScriptId || '';
                document.getElementById('pCooldown').value = p.cooldownMinutes || 60;
                document.getElementById('pNotify').checked = p.notifyOnFail;
            } else {
                document.getElementById('editTitle').innerText = 'Create New Policy';
                document.getElementById('pId').value = '';
                document.getElementById('pName').value = 'New Compliance Policy';
                document.getElementById('pEnabled').checked = true;
                document.getElementById('pDetect').value = '';
                document.getElementById('pRemediate').value = '';
                document.getElementById('pCooldown').value = 60;
                document.getElementById('pNotify').checked = true;
            }
        }

        function cancelEdit() {
            document.getElementById('colEdit').classList.add('hidden');
        }

        function savePolicy() {
            if (!document.getElementById('pDetect').value) {
                alert("A Detect Script is required!");
                return;
            }
            var p = {
                name: document.getElementById('pName').value,
                enabled: document.getElementById('pEnabled').checked,
                detectScriptId: document.getElementById('pDetect').value,
                remediateScriptId: document.getElementById('pRemediate').value,
                cooldownMinutes: parseInt(document.getElementById('pCooldown').value) || 60,
                notifyOnFail: document.getElementById('pNotify').checked
            };
            var id = document.getElementById('pId').value;
            if (id) p._id = id;

            parent.meshserver.send({ action: 'plugin', plugin: 'scripttask', pluginaction: 'savePolicy', policy: p });
            cancelEdit();
        }

        function deletePolicy(id) {
            if (confirm('Are you sure you want to delete this policy? Assignments and state history will also be removed.')) {
                parent.meshserver.send({ action: 'plugin', plugin: 'scripttask', pluginaction: 'deletePolicy', id: id });
                if (_currentPolicyId === id) { document.getElementById('pnlAssignments').style.display = 'none'; _currentPolicyId = null; }
            }
        }

        function viewAssignments(id, name) {
            _currentPolicyId = id;
            if (name) document.getElementById('lblAssignedPolicyName').innerText = name;
            document.getElementById('pnlAssignments').style.display = 'block';
            document.getElementById('colAssign').classList.add('hidden');

            var tbody = document.getElementById('tblAssignmentsBody');
            tbody.innerHTML = '';

            var myAssigns = _assignments.filter(x => x.policyId === id);
            if (myAssigns.length === 0) {
                tbody.innerHTML = '<tr><td colspan="3">No assignments. Policy is inactive.</td></tr>';
                return;
            }

            myAssigns.forEach(function (a) {
                var tr = document.createElement('tr');
                var targetName = a.targetId;
                if (a.targetType === 'node' && parent.nodes) {
                    var n = parent.nodes.find(x => x._id === a.targetId);
                    if (n) targetName = n.name;
                } else if (a.targetType === 'mesh' && parent.meshes) {
                    var m = parent.meshes[a.targetId];
                    if (m) targetName = m.name;
                }

                tr.innerHTML = `
            < td > ${ a.targetType }</td >
            <td>${targetName}</td>
            <td><span class="flink" style="color:#f88" onclick="deleteAssignment('${a._id}');">Remove</span></td>
          `;
                tbody.appendChild(tr);
            });
        }

        function showAssignForm() {
            if (!_currentPolicyId) return;
            document.getElementById('colAssign').classList.remove('hidden');
            updateTargetList();
        }

        function cancelAssign() {
            document.getElementById('colAssign').classList.add('hidden');
        }

        function testNotification() {
            parent.meshserver.send({ action: 'plugin', plugin: 'scripttask', pluginaction: 'testComplianceNotify' });
            alert("A test notification command has been sent to the MeshCentral server. If email is configured, it should arrive shortly.");
        }

        function updateTargetList() {
            var type = document.getElementById('aTargetType').value;
            var sel = document.getElementById('aTargetId');
            sel.innerHTML = '';

            if (type === 'node') {
                var nodes = parent.nodes || [];
                nodes.forEach(function (n) {
                    if (n.mtype === 2) sel.options.add(new Option(n.name, n._id));
                });
            } else if (type === 'mesh') {
                var meshes = parent.meshes || {};
                for (var key in meshes) {
                    if (meshes[key].mtype === 2) sel.options.add(new Option(meshes[key].name, key));
                }
            } else if (type === 'tag') {
                sel.options.add(new Option("Please enter the precise Tag string here ->", ""));
                // Meshcentral tags are stored differently, usually we rely on the backend to parse them
                // We will just let the user type out the tag name manually, or prompt them:
                var tagName = prompt("Enter the exact name of the Device Tag to assign this policy to:");
                if (tagName) {
                    sel.options.add(new Option("Tag: " + tagName, tagName));
                    sel.value = tagName;
                }
            }
        }

        function saveAssignment() {
            var typ = document.getElementById('aTargetType').value;
            var tid = document.getElementById('aTargetId').value;
            if (!tid) return;

            var a = {
                policyId: _currentPolicyId,
                targetType: typ,
                targetId: tid
            };
            parent.meshserver.send({ action: 'plugin', plugin: 'scripttask', pluginaction: 'savePolicyAssignment', assignment: a });
            cancelAssign();
        }

        function deleteAssignment(id) {
            if (confirm('Remove assignment?')) {
                parent.meshserver.send({ action: 'plugin', plugin: 'scripttask', pluginaction: 'deletePolicyAssignment', id: id });
            }
        }
    
  
  
    function loadSmtpData(config, error) {
        if (error) { alert("Error loading SMTP config: " + error); return; }
        if (!config) config = {};
        document.getElementById('sHost').value = config.host || '';
        document.getElementById('sPort').value = config.port || '';
        document.getElementById('sUser').value = config.user || '';
        document.getElementById('sPass').value = config.pass || '';
        document.getElementById('sFrom').value = config.from || '';
        document.getElementById('sTo').value = config.toAddress || '';
        document.getElementById('sTls').checked = config.tls || config.tlsstrict || false;
    }

    function saveSmtp() {
        var conf = {
            host: document.getElementById('sHost').value,
            port: parseInt(document.getElementById('sPort').value) || 587,
            user: document.getElementById('sUser').value,
            pass: document.getElementById('sPass').value,
            from: document.getElementById('sFrom').value,
            toAddress: document.getElementById('sTo').value,
            tls: document.getElementById('sTls').checked
        };
        parent.meshserver.send({ action: 'plugin', plugin: 'scripttask', pluginaction: 'saveSmtpConfig', config: conf });
        alert("SMTP Settings Saved!");
        goScripts();
    }

    function testSmtp() {
        parent.meshserver.send({ action: 'plugin', plugin: 'scripttask', pluginaction: 'testComplianceNotify' });
        alert("A test email has been dispatched. If settings are correct, it should arrive momentarily.");
    }

    

  
  function goScripts() {
    document.getElementById('policy_endpoints').style.display = 'none';
    document.getElementById('smtp_endpoints').style.display = 'none';
    document.getElementById('scripts_endpoints').style.display = 'block';
  }

  var scriptTree = [];
  var elementDragged = false;
  var dragCounter = 0;
  var draggedId = null;
  var nodesObj = {};
  var variables = [];
  var varScopes = { global: 'Global', script: 'Script', mesh: 'Mesh', node: 'Node' };

  function onlyUnique(value, index, self) {
    return self.indexOf(value) === index;
  }
  function resizeIframe() {
    document.body.style.height = 0;
    parent.pluginHandler.scripttask.resizeContent();
  }
  function updateNodesTable() {
    let dRows = document.querySelectorAll('.stNodeRow');
    dRows.forEach((r) => {
      r.parentNode.removeChild(r);
    });
    var tagList = [];
    var nodeRowIns = document.querySelector('#mRunTbl');
    parent.nodes.forEach(function (i) {
      var item = { ...i, ...{} };
      if (item.mtype == 2) {
        item.meshName = parent.meshes[item['meshid']].name;
        if (item._id == parent.currentNode._id) item.checked = 'checked '; else item.checked = '';
        let tpl = `< tr class="stNodeRow" >
            <td><label><input type="checkbox" ${item.checked} name="runOn[]" value="${item._id}"> <div class="nIcon j${item.icon}"></div>${item.name}</label></td>
          </tr > `;
        nodeRowIns.insertAdjacentHTML('beforeend', tpl);
        if (i.tags && i.tags.length) item.tags.forEach(function (t) { tagList.push(t) });
        nodesObj[i._id] = i;
      }
    });
    tagList = tagList.filter(onlyUnique); tagList = tagList.sort();
    var nodeRowIns = document.querySelector('#mRunTblMesh');
    for (const i in parent.meshes) { // parent.meshes.forEach(function(i) {
      var item = { ...parent.meshes[i], ...{} };
      if (item.mtype == 2) {
        let tpl = `< tr class="stNodeRow" >
            <td><label><input type="checkbox" onclick="selNodesByMesh(this);" value="${item._id}"> ${item.name}</label></td>
          </tr > `;
        nodeRowIns.insertAdjacentHTML('beforeend', tpl);
      }
    }
    var nodeRowIns = document.querySelector('#mRunTblTag');
    tagList.forEach(function (i) {
      let tpl = `< tr class="stNodeRow" >
            <td><label><input type="checkbox" onclick="selNodesByTag(this)" value="${i}"> ${i}</label></td>
      </tr > `;
      nodeRowIns.insertAdjacentHTML('beforeend', tpl);
    });
  }

  function selNodesByTag(el) {
    var t = el.value;
    var allNodes = Q('mRunTbl').querySelectorAll('input[type="checkbox"][name="runOn[]"]');
    var checked = false;
    if (el.checked) checked = true;
    allNodes.forEach(function (n) {
      if (nodesObj[n.value].tags && nodesObj[n.value].tags.indexOf(t) > -1) n.checked = checked;
    });
    return true;
  }
  function selNodesByMesh(el) {
    var mid = el.value;
    var allNodes = Q('mRunTbl').querySelectorAll('input[type="checkbox"][name="runOn[]"]');
    var checked = false;
    if (el.checked) checked = true;
    allNodes.forEach(function (n) {
      if (nodesObj[n.value].meshid == mid) n.checked = checked;
    });
    return true;
  }
  function selAllNodes(el) {
    var allNodes = Q('mRunTbl').querySelectorAll('input[type="checkbox"][name="runOn[]"]');
    var checked = false;
    if (el.checked) checked = true;
    allNodes.forEach(function (n) {
      n.checked = checked;
    });
    return true;
  }

  function doOnLoad() {
    redrawScriptTree();
    selectPreviouslySelectedScript();
    updateNodesTable();
    parent.meshserver.send({ 'action': 'plugin', 'plugin': 'scripttask', 'pluginaction': 'loadNodeHistory', 'nodeId': parent.currentNode._id });
    parent.meshserver.send({ 'action': 'plugin', 'plugin': 'scripttask', 'pluginaction': 'loadVariables', 'nodeId': parent.currentNode._id });
    parent.meshserver.send({ 'action': 'plugin', 'plugin': 'scripttask', 'pluginaction': 'getComplianceState', 'nodeId': parent.currentNode._id });
  }

  function selectPreviouslySelectedScript() {
    var sel_item = parent.getstore('_scripttask_sel_item', null)
    if (sel_item != null) {
      var s = document.getElementById(sel_item);
      if (s != null) {
        s.classList.toggle('liselected');
        goScript(s);
      }
    }
    if (sel_item != null) parent.meshserver.send({ 'action': 'plugin', 'plugin': 'scripttask', 'pluginaction': 'loadScriptHistory', 'scriptId': sel_item });
  }

  function goRun() {
    var selScript = document.querySelectorAll('.liselected');
    if (selScript.length) {
      var scriptId = selScript[0].getAttribute('x-data-id');
      if (scriptId == selScript[0].getAttribute('x-folder-id')) {
        parent.setDialogMode(2, "Oops!", 1, null, 'Please select a script. A folder is currently selected.');
      }
      else {
        parent.meshserver.send({ 'action': 'plugin', 'plugin': 'scripttask', 'pluginaction': 'runScript', 'scriptId': scriptId, 'nodes': [parent.currentNode._id], 'currentNodeId': parent.currentNode._id });
      }
    } else {
      parent.setDialogMode(2, "Oops!", 1, null, 'No script has been selected to run on the machines.');
    }
  }

  function goEdit() {
    var selScript = document.querySelectorAll('.liselected');
    if (selScript.length && (selScript[0].getAttribute('x-data-id') != selScript[0].getAttribute('x-data-folder'))) {
      var scriptId = selScript[0].getAttribute('x-data-id');
      window.open('/pluginadmin.ashx?pin=scripttask&user=1&edit=1&id=' + scriptId, '_blank');
      window.callback = function (sd) {
        parent.meshserver.send({ 'action': 'plugin', 'plugin': 'scripttask', 'pluginaction': 'editScript', 'scriptId': sd._id, 'scriptType': sd.type, 'scriptName': sd.name, 'scriptContent': sd.content, 'currentNodeId': parent.currentNode._id });
      };
    } else {
      parent.setDialogMode(2, "Oops!", 1, null, 'No script has been selected to edit.');
    }
  }

  function goAdvancedRun() {
    var cboxes = document.getElementsByName("runOn[]");
    var sel = [];

    cboxes.forEach((n) => {
      if (n.checked) sel.push(n.value);
    });
    if (sel.length == 0) {
      parent.setDialogMode(2, "Oops!", 1, null, 'No machines have been selected.');
      return;
    }
    var selScript = document.querySelectorAll('.liselected');
    if (selScript.length) {
      var scriptId = selScript[0].getAttribute('x-data-id');
      var sWin = window.open('/pluginadmin.ashx?pin=scripttask&user=1&schedule=1', 'schedule', "width=800,height=600");
      sWin.scriptId = scriptId;
      sWin.nodes = sel;
      window.schedCallback = function (opts) {
        parent.meshserver.send({
          'action': 'plugin',
          'plugin': 'scripttask',
          'pluginaction': 'addScheduledJob',
          'scriptId': opts.scriptId,
          'nodes': opts.nodes,
          'currentNodeId': parent.currentNode._id,
          'schedule': opts
        });
      };
    } else {
      parent.setDialogMode(2, "Oops!", 1, null, 'No script has been selected to run on the machines.');
    }
  }

  function goPolicy() {
    document.getElementById('scripts_endpoints').style.display = 'none';
    document.getElementById('smtp_endpoints').style.display = 'none';
    document.getElementById('policy_endpoints').style.display = 'block';
    doOnLoadPolicy();
  }

  function goSmtp() {
    document.getElementById('scripts_endpoints').style.display = 'none';
    document.getElementById('policy_endpoints').style.display = 'none';
    document.getElementById('smtp_endpoints').style.display = 'block';
    parent.meshserver.send({ action: 'plugin', plugin: 'scripttask', pluginaction: 'getSmtpConfig' });
  }

  var coll = document.getElementsByClassName("infoBar");
  for (var i = 0; i < coll.length; i++) {
    coll[i].addEventListener("click", function () {
      this.classList.toggle("active");
      var content = this.nextElementSibling;
      if (content.style.display === "block") {
        content.style.display = "none";
      } else {
        content.style.display = "block";
      }
      content.style.maxHeight = '300px';
      content.style.overflowY = 'scroll';
      resizeIframe();
    });
  }

  function goDownload() {
    var isSelected = document.querySelectorAll('.liselected');
    if (isSelected.length == 0) return;
    var sel = isSelected[0];
    var id = sel.getAttribute('x-data-id');
    if (id == sel.getAttribute('x-data-folder')) return;
    window.location = '/pluginadmin.ashx?pin=scripttask&user=1&dl=' + id;
  }
  function addScript(name, content, path) {
    // file type testing
    var n = name.split('.').pop().toLowerCase();
    if (content.split('\n')[0][0] == '#' && content.split('\n')[0][1] == '!') n = 'bash';
    if (['ps1', 'bat', 'bash'].indexOf(n) !== -1) {
      parent.meshserver.send({ action: 'plugin', plugin: 'scripttask', pluginaction: 'addScript', name: name, content: content, path: path, filetype: n });
    }
    else {
      parent.setDialogMode(2, "Oops!", 1, null, 'Currently accepted filetypes are .ps1, .bat, and bash scripts.');
    }
  }
  function redrawScriptTree() {
    var lastpath = null;
    var str = '';
    var indent = 0;
    var folder_id = null;
    str += '<div style="display: block;overflow-y: auto;max-height: 700px;">'
    scriptTree.forEach(function (f) {
      if (f.path != lastpath && f.type == 'folder') {
        indent = (f.path.match(/\//g) || []).length + 1;
        var name = f.path.match(/[^\/]+$/);
        folder_id = f._id;
        str += '<div draggable="true" x-data-path="' + f.path + '" x-data-id="' + f._id + '" x-data-folder="' + folder_id + '" style="margin-left: ' + indent + 'em;" class="lifolder" onclick="toggleCollapse(this);"><span class="fname">' + name + '</span></div>';
        lastpath = f.path;
        indent += 1;
      }
      if (f.type != 'folder') {
        str += '<div id="' + f._id + '" draggable="true"  x-data-path="' + f.path + '" x-data-id="' + f._id + '" x-data-folder="' + folder_id + '" style="margin-left: ' + indent + 'em;" class="liscript" onclick="goScript(this);"><span class="fname">' + f.name + '</span> [<span class="ftype">' + f.filetype + '</span>]</div>';
      }

    });
    str += '</div>';
    document.getElementById('scriptContainer').innerHTML = str;
    var liScripts = document.querySelectorAll('.liscript');
    var liFolders = document.querySelectorAll('.lifolder');
    liScripts.forEach(function (el) {
      el.addEventListener('mousedown', function () { elementDragged = true; });
      el.addEventListener('mouseup', function () { elementDragged = false; });
      el.addEventListener('dragstart', function (evt) { evt.dataTransfer.setData('text/plain', evt.target.getAttribute('x-data-id')); });
    });
    liFolders.forEach(function (el) {
      el.addEventListener('drop', dropMove);
      el.addEventListener('dragover', function (e) { e.preventDefault(); });
      el.addEventListener('mousedown', function () { elementDragged = true; });
      el.addEventListener('mouseup', function () { elementDragged = false; });
      el.addEventListener('dragstart', function (evt) { evt.dataTransfer.setData('text/plain', evt.target.getAttribute('x-data-id')); });
    });
    resizeIframe();
    selectPreviouslySelectedScript();
  }
  parent.pluginHandler.scripttask.newScriptTree = function (message) {
    scriptTree = message.event.tree;
    redrawScriptTree();
  }
  parent.pluginHandler.scripttask.loadHistory = function (message) {
    // cache script names
    var nNames = {};
    parent.nodes.forEach(function (n) {
      nNames[n._id] = n.name;
    });
    if (message.event.nodeHistory != null && message.event.nodeId == parent.currentNode._id) {
      var nHistTbl = document.getElementById('nHistTbl');
      var rows = nHistTbl.querySelectorAll('.stNHRow');
      if (rows.length) {
        rows.forEach(function (r) {
          r.parentNode.removeChild(r);
        });
      }
      if (message.event.nodeHistory.length) {
        message.event.nodeHistory.forEach(function (nh) {
          nh.latestTime = Math.max(nh.completeTime, nh.queueTime, nh.dispatchTime, nh.dontQueueUntil);
        });
        message.event.nodeHistory.sort((a, b) => (a.latestTime < b.latestTime) ? 1 : -1);
        message.event.nodeHistory.forEach(function (nh) {
          nh = prepHistory(nh);
          let tpl = '<td>' + nh.timeStr + '</td> \
                    <td>' + nh.runBy + '</td> \
                    <td>' + nh.scriptName + '</td> \
                    <td>' + nh.statusTxt + '</td> \
                    <td>' + nh.returnTxt + '</td>';
          let tr = nHistTbl.insertRow(-1);
          tr.innerHTML = tpl;
          tr.classList.add('stNHRow');
        });
      }
    }
    var currentScript = document.getElementById('scriptHistory');
    var currentScriptId = currentScript.getAttribute('x-data-id');
    if (message.event.scriptHistory != null && message.event.scriptId == currentScriptId) {
      var sHistTbl = document.getElementById('sHistTbl');
      var rows = sHistTbl.querySelectorAll('.stSHRow');
      if (rows.length) {
        rows.forEach(function (r) {
          r.parentNode.removeChild(r);
        });
      }
      if (message.event.scriptHistory.length) {
        message.event.scriptHistory.forEach(function (nh) {
          nh.latestTime = Math.max(nh.completeTime, nh.queueTime, nh.dispatchTime, nh.dontQueueUntil);
        });
        message.event.scriptHistory.sort((a, b) => (a.latestTime < b.latestTime) ? 1 : -1);
        message.event.scriptHistory.forEach(function (nh) {
          nh = prepHistory(nh);
          let tpl = '<td>' + nh.timeStr + '</td> \
                    <td>' + nh.runBy + '</td> \
                    <td>' + nNames[nh.node] + '</td> \
                    <td>' + nh.statusTxt + '</td> \
                    <td>' + nh.returnTxt + '</td>';
          let tr = sHistTbl.insertRow(-1);
          tr.innerHTML = tpl;
          tr.classList.add('stSHRow');
        });
      }
    }
    resizeIframe();
  }
  function prepHistory(nh) {
    var nowTime = Math.floor(new Date() / 1000);
    var d = new Date(0);
    d.setUTCSeconds(nh.latestTime);
    nh.timeStr = d.toLocaleString();
    if (nh.errorVal != null) { nh.returnTxt = nh.errorVal; } else { nh.returnTxt = nh.returnVal; }
    nh.statusTxt = 'Queued';
    if (nh.dispatchTime != null) nh.statusTxt = 'Running';
    if (nh.errorVal != null) nh.statusTxt = 'Error';
    if (nh.returnVal != null) nh.statusTxt = 'Completed';
    if (nh.dontQueueUntil > nowTime) nh.statusTxt = 'Scheduled';
    if (nh.returnTxt == null) nh.returnTxt = '&nbsp;';
    if (nh.statusTxt == 'Completed') {
      nh.statusTxt = '<span title="Completed ' + secondsToHms((nh.completeTime - nh.dispatchTime)) + '">' + nh.statusTxt + '</span>';
    }
    if (isJsonString(nh.returnTxt)) {
      try {
        nh.returnObj = JSON.parse(nh.returnTxt);
        nh.returnTxt = 'Object: ';
        nh.returnTxt += '' + JSON.stringify(nh.returnObj, null, 2);
        nh.returnTxt = nh.returnTxt.replace(/\n\s*\n/g, '\n');
        nh.returnTxt = nh.returnTxt.replace(/(?:\r\n|\r|\n)/g, '<br />');
      } catch (e) { }
    } else {
      if (typeof nh.returnTxt == 'string') {
        nh.returnTxt = nh.returnTxt.replace(/\n\s*\n/g, '\n');
        nh.returnTxt = nh.returnTxt.replace(/(?:\r\n|\r|\n)/g, '<br />');
      }
    }
    return nh;
  }
  parent.pluginHandler.scripttask.loadVariables = function (message) {
    if (message.event.vars.length) {
      var vars = message.event.vars;
      vars.forEach(function (vd) {
        switch (vd.scope) {
          case 'global':
            vd.scopeTargetTxt = vd.scopeTargetHtml = 'N/A';
            break;
          case 'script':
            var s = scriptTree.filter(obj => { return obj._id === vd.scopeTarget })[0]
            vd.scopeTargetHtml = '<span title="' + s.path + '">' + s.name + '</span>';
            vd.scopeTargetTxt = s.name;
            break;
          case 'mesh':
            vd.scopeTargetTxt = vd.scopeTargetHtml = parent.meshes[vd.scopeTarget].name;
            break;
          case 'node':
            var n = parent.nodes.filter(obj => { return obj._id === vd.scopeTarget })[0]
            vd.scopeTargetHtml = '<span title="' + n.meshnamel + '">' + n.name + '</span>';
            vd.scopeTargetTxt = n.name;
            break;
          default:
            vd.scopeTargetTxt = vd.scopeTargetHtml = 'N/A';
            break;
        }
        vd.scopeTxt = varScopes[vd.scope];
      })
      var ordering = { 'global': 0, 'script': 1, 'mesh': 2, 'node': 3 }
      vars.sort((a, b) => {
        return (ordering[a.scope] - ordering[b.scope])
          || a.name.localeCompare(b.name)
          || a.scopeTargetTxt.localeCompare(b.scopeTargetTxt);
      });
      variables = vars;
      parseVariables();
    }
  }
  parent.pluginHandler.scripttask.policyData = function (message) {
    loadPolicyData(message.event.policies, message.event.assignments, message.event.error);
  }
  parent.pluginHandler.scripttask.smtpData = function (message) {
    loadSmtpData(message.event.config, message.event.error);
  }
  parent.pluginHandler.scripttask.complianceStateData = function (message) {
    var state = message.event.state || [];
    var policyNames = {};
    // Fetch policies to map names? They are not cached in user.handlebars, maybe just request them or rely on ID for now if policies aren't loaded. 
    // Actually, we can fetch policies globally, but for now we just show IDs or have the backend send enriched data. 
    // Let's modify later, for now just show basic state.

    var compTbl = document.getElementById('compTbl');
    var rows = compTbl.querySelectorAll('.stCRow');
    if (rows.length) rows.forEach(function (r) { r.parentNode.removeChild(r); });

    if (state.length) {
      state.forEach(function (s) {
        let tpl = `< td > ${ s.policyName || s.policyId }</td >
                <td><b>${s.state}</b></td>
                <td>${s.lastRunTime ? new Date(s.lastRunTime * 1000).toLocaleString() : 'Never'}</td>
                <td><pre style="max-height:100px;overflow:auto;margin:0;">${s.lastOutput || ''}</pre></td>`;
        let tr = compTbl.insertRow(-1);
        tr.innerHTML = tpl;
        tr.classList.add('stCRow');
        // alternate row colors:
        if (compTbl.rows.length % 2 === 0) tr.style.backgroundColor = '#CCC';
      });
    }
    resizeIframe();
  }
  function parseVariables() {
    var vTbl = document.getElementById('varTbl');
    var rows = vTbl.querySelectorAll('.stVRow');

    if (rows.length) {
      rows.forEach(function (r) {
        r.parentNode.removeChild(r);
      });
    }
    var scriptEl = document.querySelectorAll('.liselected');
    if (scriptEl.length != 1) return;
    var el = scriptEl[0];
    scopeTargetScriptId = el.getAttribute('x-data-id');
    variables.forEach(function (vd) {
      if (vd.scope == 'script' && vd.scopeTarget != scopeTargetScriptId) return;
      if (vd.scope == 'mesh' && vd.scopeTarget != parent.currentNode.meshid) return;
      if (vd.scope == 'node' && vd.scopeTarget != parent.currentNode._id) return;
      let actionHtml = '<span class="flink" onclick="editVar(this);">Edit</span> <span class="flink" onclick="delVar(this);">Delete</span>';
      let tpl = '<td>' + vd.name + '</td> \
            <td>' + vd.value + '</td> \
            <td>' + vd.scopeTxt + '</td> \
            <td>' + vd.scopeTargetHtml + '</td> \
            <td>' + actionHtml + '</td>';
      let tr = vTbl.insertRow(-1);
      tr.innerHTML = tpl;
      tr.classList.add('stVRow');
      tr.setAttribute('x-data-id', vd._id);
    })
  }
  parent.pluginHandler.scripttask.loadSchedule = function (message) {
    // cache script names
    var nNames = {}, sNames = {};
    parent.nodes.forEach(function (n) {
      nNames[n._id] = n.name;
    });
    scriptTree.forEach(function (s) {
      if (s.type == 'script') sNames[s._id] = s.name;
    });
    if (message.event.nodeSchedule != null && message.event.nodeId == parent.currentNode._id) {
      var nTbl = document.getElementById('nSchTbl');
      var rows = nTbl.querySelectorAll('.stNSRow');
      if (rows.length) {
        rows.forEach(function (r) {
          r.parentNode.removeChild(r);
        });
      }
      if (message.event.nodeSchedule.length) {
        message.event.nodeSchedule.forEach(function (nh) {
          nh = prepSchedule(nh);
          let tpl = '<td>' + sNames[nh.scriptId] + '</td> \
                    <td>' + nh.scheduledBy + '</td> \
                    <td>' + nh.everyTxt + '</td> \
                    <td>' + nh.startedTxt + '</td> \
                    <td>' + nh.endingTxt + '</td> \
                    <td>' + nh.lastRunTxt + '</td> \
                    <td>' + nh.nextRunTxt + '</td> \
                    <td>' + nh.actionTxt + '</td>';
          let tr = nTbl.insertRow(-1);
          tr.innerHTML = tpl;
          tr.classList.add('stNSRow');
          tr.setAttribute('x-data-id', nh._id);
        });
      }
    }
    var currentScript = document.getElementById('scriptHistory');
    var currentScriptId = currentScript.getAttribute('x-data-id');
    if (message.event.scriptSchedule != null && message.event.scriptId == currentScriptId) {
      var sTbl = document.getElementById('sSchTbl');
      var rows = sTbl.querySelectorAll('.stSSRow');
      if (rows.length) {
        rows.forEach(function (r) {
          r.parentNode.removeChild(r);
        });
      }
      if (message.event.scriptSchedule.length) {
        message.event.scriptSchedule.forEach(function (nh) {
          nh = prepSchedule(nh);
          let tpl = '<td>' + nNames[nh.node] + '</td> \
                    <td>' + nh.scheduledBy + '</td> \
                    <td>' + nh.everyTxt + '</td> \
                    <td>' + nh.startedTxt + '</td> \
                    <td>' + nh.endingTxt + '</td> \
                    <td>' + nh.lastRunTxt + '</td> \
                    <td>' + nh.nextRunTxt + '</td> \
                    <td>' + nh.actionTxt + '</td>';
          let tr = sTbl.insertRow(-1);
          tr.innerHTML = tpl;
          tr.classList.add('stSSRow');
          tr.setAttribute('x-data-id', nh._id);
        });
      }
    }
    resizeIframe();
  }
  function prepSchedule(nh) {
    nh.everyTxt = nh.interval + ' ';
    switch (nh.recur) {
      case 'once':
        nh.everyTxt = 'Once';
        break;
      case 'minutes':
        nh.everyTxt += 'minute';
        break;
      case 'hourly':
        nh.everyTxt += 'hour';
        break;
      case 'daily':
        nh.everyTxt += 'day';
        break;
      case 'weekly':
        nh.everyTxt += 'week';
        break;
      case 'monthly':
        nh.everyTxt += 'month';
        break;
    }
    if (nh.interval > 1) nh.everyTxt += 's';

    if (nh.recur == 'weekly') {
      nh.daysOfWeek = nh.daysOfWeek.map(el => Number(el));
      nh.everyTxt += ' (';
      nh.daysOfWeek.forEach(function (num) {
        switch (num) {
          case 0: nh.everyTxt += 'S'; break;
          case 1: nh.everyTxt += 'M'; break;
          case 2: nh.everyTxt += 'T'; break;
          case 3: nh.everyTxt += 'W'; break;
          case 4: nh.everyTxt += 'R'; break;
          case 5: nh.everyTxt += 'F'; break;
          case 6: nh.everyTxt += 'S'; break;
        }
      });
      nh.everyTxt += ')';
    }

    var d = new Date(0); d.setUTCSeconds(nh.startAt);
    nh.startedTxt = d.toLocaleString();
    d = new Date(0); d.setUTCSeconds(nh.endAt);
    nh.endingTxt = d.toLocaleString();
    if (nh.endAt == null) nh.endingTxt = 'Never';
    if (nh.recur == 'once') nh.endingTxt = 'After first run';
    d = new Date(0); d.setUTCSeconds(nh.lastRun);
    nh.lastRunTxt = d.toLocaleString();
    if (nh.lastRun == null) nh.lastRunTxt = 'Never';
    d = new Date(0); d.setUTCSeconds(nh.nextRun);
    nh.nextRunTxt = d.toLocaleString();
    if (nh.nextRun == null) nh.nextRunTxt = 'Never';
    if (nh.nextRun < nh.lastRun) nh.nextRunTxt = 'Running now';

    nh.actionTxt = '<span class="delSched" onclick="deleteSchedule(this);">Delete</span>';
    return nh;
  }
  function secondsToHms(d) {
    d = Number(d);
    if (d == 0) return "immediately";
    var h = Math.floor(d / 3600);
    var m = Math.floor(d % 3600 / 60);
    var s = Math.floor(d % 3600 % 60);

    var hDisplay = h > 0 ? h + (h == 1 ? " hour, " : " hours, ") : "";
    var mDisplay = m > 0 ? m + (m == 1 ? " minute, " : " minutes, ") : "";
    var sDisplay = s > 0 ? s + (s == 1 ? " second" : " seconds") : "";
    return "in " + hDisplay + mDisplay + sDisplay;
  }
  function isJsonString(str) {
    try {
      JSON.parse(str);
    } catch (e) {
      return false;
    }
    return true;
  }
  function newVarEx() {
    var name = parent.document.getElementById('stvarname').value;
    var scope = parent.document.getElementById('stvarscope').value;
    var value = parent.document.getElementById('stvarvalue').value;
    var scopeTarget = null;
    if (scope == 'script') {
      var scriptEl = document.querySelectorAll('.liselected');
      if (scriptEl.length != 1) return;
      var el = scriptEl[0];
      scopeTarget = el.getAttribute('x-data-id');
    } else if (scope == 'mesh') {
      scopeTarget = parent.currentNode.meshid;
    } else if (scope == 'node') {
      scopeTarget = parent.currentNode._id;
    }
    parent.meshserver.send({ action: 'plugin', plugin: 'scripttask', pluginaction: 'newVar', name: name, scope: scope, scopeTarget: scopeTarget, value: value, currentNodeId: parent.currentNode._id });

  }
  function newVar() {
    parent.setDialogMode(2, "New Variable", 3, newVarEx, 'Variable Name: <input type="text" id=stvarname /><br />Scope: <select id=stvarscope><option value="global">Global</option><option value="script">Script</option><option value="mesh">Mesh</option><option value="node">Node</option></select><br />Value: <input id="stvarvalue" type="text" />');
    parent.focusTextBox('stvarname');
  }
  function editVarEx() {
    var varid = parent.document.getElementById('stvarid').value;
    var name = parent.document.getElementById('stvarname').value;
    var scope = parent.document.getElementById('stvarscope').value;
    var value = parent.document.getElementById('stvarvalue').value;
    var scopeTarget = null;
    if (scope == 'script') {
      var scriptEl = document.querySelectorAll('.liselected');
      if (scriptEl.length != 1) return;
      var el = scriptEl[0];
      scopeTarget = el.getAttribute('x-data-id');
    } else if (scope == 'mesh') {
      scopeTarget = parent.currentNode.meshid;
    } else if (scope == 'node') {
      scopeTarget = parent.currentNode._id;
    }
    parent.meshserver.send({ action: 'plugin', plugin: 'scripttask', pluginaction: 'editVar', id: varid, name: name, scope: scope, scopeTarget: scopeTarget, value: value, currentNodeId: parent.currentNode._id });
  }
  function editVar(el) {
    var vid = el.parentNode.parentNode.getAttribute('x-data-id');
    var v = variables.filter(obj => { return obj._id === vid })[0];
    var soptHtml = '';
    for (const [k, t] of Object.entries(varScopes)) {
      soptHtml += '<option value="' + k + '"';
      if (v.scope == k) soptHtml += ' selected';
      soptHtml += '>' + t + '</option>';
    }
    parent.setDialogMode(2, "Edit Variable", 3, editVarEx, 'Variable Name: <input type="text" id=stvarname value="' + v.name + '" /><br />Scope: <select id=stvarscope>' + soptHtml + '</select><br />Value: <input id="stvarvalue" type="text" value="' + v.value + '" /><input type="hidden" id="stvarid" value="' + vid + '" />');
    parent.focusTextBox('stvarname');
  }
  function delVarEx() {
    var varid = parent.document.getElementById('stvarid').value;
    parent.meshserver.send({ action: 'plugin', plugin: 'scripttask', pluginaction: 'deleteVar', id: varid, currentNodeId: parent.currentNode._id });

  }
  function delVar(el) {
    var vid = el.parentNode.parentNode.getAttribute('x-data-id');
    var v = variables.filter(obj => { return obj._id === vid })[0];
    parent.setDialogMode(2, "Delete Variable", 3, delVarEx, 'Are you sure you want to delete this?<input type="hidden" id="stvarid" value="' + vid + '" /><br />Name: ' + v.name + '<br />Scope: ' + varScopes[v.scope] + '<br />Value: ' + v.value);
  }
  function renameEx() {
    var name = parent.document.getElementById('stfilename').value;
    var id = parent.document.getElementById('stid').value;
    parent.meshserver.send({ action: 'plugin', plugin: 'scripttask', pluginaction: 'rename', name: name, id: id, currentNodeId: parent.currentNode._id });
  }
  function goRename() {
    var scriptEl = document.querySelectorAll('.liselected');
    if (scriptEl.length != 1) return;
    var el = scriptEl[0];
    var name = el.querySelector('.fname').innerHTML;
    var id = el.getAttribute('x-data-id');
    parent.setDialogMode(2, "Rename " + name, 3, renameEx, '<input type="text"  value="' + name + '" id=stfilename style=width:100% /><input type="hidden" id="stid" value="' + id + '" />');
    parent.focusTextBox('stfilename');
  }
  function newEx() {
    var name = parent.document.getElementById('stfilename').value;
    var parent_id = parent.document.getElementById('stfolderid').value;
    var fileType = parent.document.getElementById('stfiletype').value;
    parent.meshserver.send({ action: 'plugin', plugin: 'scripttask', pluginaction: 'new', name: name, parent_id: parent_id, filetype: fileType, currentNodeId: parent.currentNode._id });
  }
  function goNew() {
    var scriptEl = document.querySelectorAll('.liselected');
    var folder_id = null;
    if (scriptEl.length > 0) {
      var el = scriptEl[0];
      folder_id = el.getAttribute('x-data-folder');
    }
    parent.setDialogMode(2, "New Script", 3, newEx, 'Name: <input type="text"  value="' + name + '" id=stfilename style=width:100% /><br />Type:<select id="stfiletype"><option value="bash">Bash</option><option value="bat">BAT</option><option value="ps1">PS1</option></select><input type="hidden" id="stfolderid" value="' + folder_id + '" />');
    parent.focusTextBox('stfilename');
  }
  function newFolderEx() {
    var name = parent.document.getElementById('stfoldername').value;
    var parent_id = parent.document.getElementById('stfolderid').value;
    parent.meshserver.send({ action: 'plugin', plugin: 'scripttask', pluginaction: 'newFolder', name: name, parent_id: parent_id });
  }
  function goNewFolder() {
    var scriptEl = document.querySelectorAll('.liselected');
    var folder_id = null;
    if (scriptEl.length > 0) {
      var el = scriptEl[0];
      folder_id = el.getAttribute('x-data-folder');
    }
    parent.setDialogMode(2, "New Folder", 3, newFolderEx, '<input type="text"  value="" id=stfoldername style=width:100% /><input type="hidden" id="stfolderid" value="' + folder_id + '" />');
    parent.focusTextBox('stfoldername');
  }
  function goScript(el) {
    var xdi = el.getAttribute('x-data-id');
    var scriptEls = document.querySelectorAll('.liselected');
    parent.putstore('_scripttask_sel_item', xdi);
    scriptEls.forEach(function (e) {
      e.classList.remove('liselected');
    })
    el.classList.add('liselected');
    Q('scriptHistory').setAttribute('x-data-id', el.getAttribute('x-data-id'));
    if (xdi != el.getAttribute('x-data-folder')) {
      parent.meshserver.send({ action: 'plugin', plugin: 'scripttask', pluginaction: 'loadScriptHistory', scriptId: xdi });
    }
    parseVariables();
  }
  function deleteEx() {
    var id = parent.document.getElementById('stdelid').value;
    parent.meshserver.send({ action: 'plugin', plugin: 'scripttask', pluginaction: 'delete', id: id });
  }
  function goDelete() {
    var els = document.querySelectorAll('.liselected');
    if (els.length == 0) return;
    var el = els[0];
    var name = el.innerHTML;
    var id = el.getAttribute('x-data-id');
    parent.setDialogMode(2, "Delete " + name, 3, deleteEx, 'Are you sure? <input type="hidden" id="stdelid" value="' + id + '" />');
  }
  function deleteScheduleEx() {
    var id = parent.document.getElementById('stdelid').value;
    parent.meshserver.send({ action: 'plugin', plugin: 'scripttask', pluginaction: 'delete', id: id });
  }
  function deleteSchedule(el) {
    var id = el.parentNode.parentNode.getAttribute('x-data-id');
    parent.setDialogMode(2, "Delete Schedule", 3, deleteScheduleEx, 'Are you sure you want to delete this schedule? <input type="hidden" id="stdelid" value="' + id + '" />');
  }
  function toggleCollapse(el) {
    var xdf = el.getAttribute('x-data-path');
    var folderEls = document.querySelectorAll('.lifolder, .liscript');
    var showHide = null;
    folderEls.forEach(function (e) {
      if (e === el) return;
      if (e.getAttribute('x-data-path').indexOf(xdf) !== -1) {
        if (e.style.display == 'none') {
          if (showHide === null) showHide = '';
        } else {
          if (showHide === null) showHide = 'none';
        }
        e.style.display = showHide;
      }
    });
    goScript(el);
  }
  function handleFileSelect(evt) {
    evt.preventDefault();
    var files = evt.dataTransfer.files; // FileList object
    // files is a FileList of File objects. List some properties.
    QV('dropBlock', false);
    var output = [];
    fileUpload(files);
    elementDragged = false;
    if (dragTimer != null) dragTimer = null;
    //document.getElementById('list').innerHTML = '<ul>' + output.join('') + '</ul>';
  }

  function fileUpload(files) {
    if (files == null) files = document.getElementById('files').files;
    var path = null;
    var isSelected = document.querySelectorAll('.liselected');
    if (isSelected.length) {
      var sel = isSelected[0];
      path = sel.getAttribute('x-data-path');
    }
    for (var i = 0, f; f = files[i]; i++) {
      var reader = new FileReader();
      reader.fileName = f.name;
      reader.readAsBinaryString(f);
      reader.addEventListener('loadend', function (e, file) {
        addScript(e.currentTarget.fileName, e.currentTarget.result, path);
      });
    }
  }

  var dropZone = document.getElementById('scriptTaskUser');
  var dropBlock = document.getElementById('dropBlock');
  var dragTimer = null;
  function allowDrag(e) {
    if (!elementDragged) {  // Test that the item being dragged is a valid one
      e.dataTransfer.dropEffect = 'copy';
      QV('dropBlock', true);
      e.preventDefault();
      clearTimeout(dragTimer);
      dragTimer = setTimeout(function () { dragCounter = 0; QV('dropBlock', false); }, 100);
    }
  }

  function dropMove(evt) {
    const move_id = evt.dataTransfer.getData('text');
    const container_id = evt.target.parentNode.getAttribute('x-data-id');
    parent.meshserver.send({ action: 'plugin', plugin: 'scripttask', pluginaction: 'move', id: move_id, to: container_id });
  }
  // file upload events
  window.addEventListener('dragenter', function (e) {
    dragCounter++;
  });
  dropZone.addEventListener('dragenter', allowDrag);
  dropZone.addEventListener('dragover', allowDrag);
  dropZone.addEventListener('dragleave', function (e) {
    dragCounter--;
    if (dragCounter == 0) {
      QV('dropBlock', false);
      elementDragged = false;
    }
  });
  dropZone.addEventListener('drop', handleFileSelect);

        