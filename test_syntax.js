
    var _policies = [];
    var _assignments = [];
    var _currentPolicyId = null;

    function doOnLoadPolicy() {
      if (!parent || !parent.meshserver) {
        document.getElementById('tblPoliciesBody').innerHTML = `<tr>
            <td colspan="5" style="color:red; font-weight:bold;">Error: Unable to connect to MeshCentral Server.</td>
          </tr>`;
        return;
      }
      populateScriptDropdowns();
      refreshData();
    }

    function refreshData() {
      parent.meshserver.send({ action: 'plugin', plugin: 'scripttask', pluginaction: 'getPolicies' });
    }

    function loadPolicyData(policies, assignments, error) {
      console.log("loadPolicyData called with:", policies, assignments, error);
      if (error) {
        document.getElementById('tblPoliciesBody').innerHTML = `<tr>
            <td colspan="5" style="color:red; font-weight:bold;">Error Loading Policies: ${error}</td>
          </tr>`;
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
        tbody.innerHTML = `<tr>
            <td colspan="5">No policies found.</td>
          </tr>`;
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
      <span class="flink" onclick="viewAssignments('${p._id}', '${p.name.replace(/'/g, " \\'")}');">Assignments</span> |
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
        document.getElementById('pNotifySuccess').checked = !!p.notifyOnSuccess;
      } else {
        document.getElementById('editTitle').innerText = 'Create New Policy';
        document.getElementById('pId').value = '';
        document.getElementById('pName').value = 'New Compliance Policy';
        document.getElementById('pEnabled').checked = true;
        document.getElementById('pDetect').value = '';
        document.getElementById('pRemediate').value = '';
        document.getElementById('pCooldown').value = 60;
        document.getElementById('pNotify').checked = true;
        document.getElementById('pNotifySuccess').checked = false;
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
        notifyOnFail: document.getElementById('pNotify').checked,
        notifyOnSuccess: document.getElementById('pNotifySuccess').checked
      };
      var id = document.getElementById('pId').value;
      if (id) p._id = id;

      parent.meshserver.send({ action: 'plugin', plugin: 'scripttask', pluginaction: 'savePolicy', policy: p });
      cancelEdit();
    }

    function deletePolicy(id) {
      if (confirm('Are you sure you want to delete this policy? Assignments and state history will also be removed.')) {
        parent.meshserver.send({ action: 'plugin', plugin: 'scripttask', pluginaction: 'deletePolicy', id: id });
        if (_currentPolicyId === id) {
          document.getElementById('pnlAssignments').style.display = 'none'; _currentPolicyId =
            null;
        }
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
        tbody.innerHTML = `<tr>
            <td colspan="3">No assignments. Policy is inactive.</td>
          </tr>`;
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
    < td> ${a.targetType}</td>
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
      alert(`A test notification command has been sent to the MeshCentral server. If email is configured, it should
      arrive shortly.`);
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
      parent.meshserver.send({
        action: 'plugin', plugin: 'scripttask', pluginaction: 'savePolicyAssignment', assignment:
          a
      });
      cancelAssign();
    }

    function deleteAssignment(id) {
      if (confirm('Remove assignment?')) {
        parent.meshserver.send({
          action: 'plugin', plugin: 'scripttask', pluginaction: 'deletePolicyAssignment', id: id
        });
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




    function setActiveTab(id) {
      ['tabScripts', 'tabPolicies', 'tabCompliance', 'tabSmtp'].forEach(function (t) {
        var el = document.getElementById(t);
        if (el) el.classList.remove('tabActive');
      });
      var active = document.getElementById(id);
      if (active) active.classList.add('tabActive');
    }

    function goScripts() {
      document.getElementById('policy_endpoints').style.display = 'none';
      document.getElementById('smtp_endpoints').style.display = 'none';
      document.getElementById('compliance_endpoints').style.display = 'none';
      document.getElementById('scripts_endpoints').style.display = 'block';
      setActiveTab('tabScripts');
      parent.meshserver.send({ action: 'plugin', plugin: 'scripttask', pluginaction: 'getScripts' });
      resizeIframe();
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
          let tpl = `< tr class="stNodeRow">
        <td><label><input type="checkbox" ${item.checked} name="runOn[]" value="${item._id}">
            <div class="nIcon j${item.icon}"></div>${item.name}
          </label></td>
        </tr> `;
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
          let tpl = `< tr class="stNodeRow">
          <td><label><input type="checkbox" onclick="selNodesByMesh(this);" value="${item._id}"> ${item.name}</label>
          </td>
          </tr> `;
          nodeRowIns.insertAdjacentHTML('beforeend', tpl);
        }
      }
      var nodeRowIns = document.querySelector('#mRunTblTag');
      tagList.forEach(function (i) {
        let tpl = `< tr class="stNodeRow">
            <td><label><input type="checkbox" onclick="selNodesByTag(this)" value="${i}"> ${i}</label></td>
            </tr> `;
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

    function doOnLoad() {
      redrawScriptTree();
      selectPreviouslySelectedScript();
      updateNodesTable();
      parent.meshserver.send({
        'action': 'plugin', 'plugin': 'scripttask', 'pluginaction': 'loadNodeHistory',
        'nodeId': parent.currentNode._id
      });
      parent.meshserver.send({
        'action': 'plugin', 'plugin': 'scripttask', 'pluginaction': 'loadVariables',
        'nodeId': parent.currentNode._id
      });
      parent.meshserver.send({
        'action': 'plugin', 'plugin': 'scripttask', 'pluginaction': 'getComplianceState',
        'nodeId': parent.currentNode._id
      });
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
      if (sel_item != null) parent.meshserver.send({
        'action': 'plugin', 'plugin': 'scripttask', 'pluginaction':
          'loadScriptHistory', 'scriptId': sel_item
      });
    }

    function goRun() {
      var selScript = document.querySelectorAll('.liselected');
      if (selScript.length) {
        var scriptId = selScript[0].getAttribute('x-data-id');
        if (scriptId == selScript[0].getAttribute('x-folder-id')) {
          parent.setDialogMode(2, "Oops!", 1, null, 'Please select a script. A folder is currently selected.');
        }
        else {
          parent.meshserver.send({
            'action': 'plugin', 'plugin': 'scripttask', 'pluginaction': 'runScript',
            'scriptId': scriptId, 'nodes': [parent.currentNode._id], 'currentNodeId': parent.currentNode._id
          });
        }
      } else {
        parent.setDialogMode(2, "Oops!", 1, null, 'No script has been selected to run on the machines.');
      }
    }

    function goEdit() {
      var selScript = document.querySelectorAll('.liselected');
      if (selScript.length && (selScript[0].getAttribute('x-data-id') !=
        selScript[0].getAttribute('x-data-folder'))) {
        var scriptId = selScript[0].getAttribute('x-data-id');
        window.open('/pluginadmin.ashx?pin=scripttask&user=1&edit=1&id=' + scriptId, '_blank');
        window.callback = function (sd) {
          parent.meshserver.send({
            'action': 'plugin', 'plugin': 'scripttask', 'pluginaction': 'editScript',
            'scriptId': sd._id, 'scriptType': sd.type, 'scriptName': sd.name, 'scriptContent': sd.content,
            'currentNodeId': parent.currentNode._id
          });
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
        var sWin = window.open('/pluginadmin.ashx?pin=scripttask&user=1&schedule=1', 'schedule',
          "width=800,height=600");
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
      document.getElementById('compliance_endpoints').style.display = 'none';
      document.getElementById('policy_endpoints').style.display = 'block';
      setActiveTab('tabPolicies');
      doOnLoadPolicy();
      resizeIframe();
    }

    function goSmtp() {
      document.getElementById('scripts_endpoints').style.display = 'none';
      document.getElementById('policy_endpoints').style.display = 'none';
      document.getElementById('compliance_endpoints').style.display = 'none';
      document.getElementById('smtp_endpoints').style.display = 'block';
      setActiveTab('tabSmtp');
      parent.meshserver.send({ action: 'plugin', plugin: 'scripttask', pluginaction: 'getSmtpConfig' });
      resizeIframe();
    }

    function goCompliance() {
      document.getElementById('scripts_endpoints').style.display = 'none';
      document.getElementById('policy_endpoints').style.display = 'none';
      document.getElementById('smtp_endpoints').style.display = 'none';
      document.getElementById('compliance_endpoints').style.display = 'block';
      setActiveTab('tabCompliance');
      var tbody = document.getElementById('cev-overview-body');
      if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="color:#999;font-style:italic;">Loading...</td></tr>';
      parent.meshserver.send({ action: 'plugin', plugin: 'scripttask', pluginaction: 'getComplianceOverview' });
      parent.meshserver.send({ action: 'plugin', plugin: 'scripttask', pluginaction: 'getRetentionRules' });
      resizeIframe();
    }

    function showComplianceOverview() {
      document.getElementById('cev-overview').style.display = 'block';
      document.getElementById('cev-detail').style.display = 'none';
    }

    var complianceNodeMap = {}; // nodeId -> name from parent.nodes

    function getNodeName(nodeId) {
      if (parent && parent.nodes) {
        var n = parent.nodes.find(function (x) { return x._id === nodeId; });
        if (n) return n.name;
      }
      return nodeId.slice(-8);
    }

    function getNodeDesc(nodeId) {
      if (parent && parent.nodes) {
        var n = parent.nodes.find(function (x) { return x._id === nodeId; });
        if (n && n.desc) return n.desc;
      }
      return '';
    }

    function fmtTs(ts) {
      if (!ts) return '-';
      return new Date(ts * 1000).toLocaleString();
    }

    var complianceOverviewData = [];
    var complianceSortKey = 'name';
    var complianceSortAsc = true;

    // Parse WMI-style boot date (e.g. "20250221120000.000000+000" or ISO or Unix secs)
    function fmtBootTime(val) {
      if (!val) return '-';
      // WMI format: YYYYMMDDHHmmss.ffffff+offset
      var wmi = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(String(val));
      if (wmi) {
        var d = new Date(Date.UTC(
          parseInt(wmi[1]), parseInt(wmi[2]) - 1, parseInt(wmi[3]),
          parseInt(wmi[4]), parseInt(wmi[5]), parseInt(wmi[6])
        ));
        return d.toLocaleString();
      }
      // Unix timestamp (number or numeric string > 1e9)
      var n = Number(val);
      if (!isNaN(n) && n > 1e9) return new Date(n < 1e12 ? n * 1000 : n).toLocaleString();
      // ISO / already human-readable
      var d2 = new Date(val);
      if (!isNaN(d2)) return d2.toLocaleString();
      return String(val);
    }

    function renderComplianceOverview(rows) {
      var tbody = document.getElementById('cev-overview-body');
      if (!tbody) return;
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="color:#999;font-style:italic;">No compliance data yet. Data is collected when agents connect.</td></tr>';
        return;
      }
      var html = '';
      rows.forEach(function (row) {
        var name = getNodeName(row.nodeId);
        var ipLink = row.lastIp
          ? '<a href="https://iplocation.com/?ip=' + encodeURIComponent(row.lastIp) + '" target="_blank" rel="noopener" style="color:#0066cc;">' + row.lastIp + '</a>'
          : '-';
        var ipCell = ipLink + '<br><span style="color:#999;font-size:11px;">' + fmtTs(row.lastIpTimestamp) + '</span>';

        var desc = getNodeDesc(row.nodeId);
        html += '<tr data-name="' + name.toLowerCase() + '" data-user="' + (row.lastUser || '').toLowerCase() + '" data-desc="' + desc.toLowerCase() + '">';
        html += '<td>' + name + '</td>';
        html += '<td>' + (desc || '<span style="color:#bbb;font-style:italic;">-</span>') + '</td>';
        html += '<td>' + (row.lastUser || '<span style="color:#bbb;font-style:italic;">-</span>') + '</td>';
        html += '<td>' + ipCell + '</td>';
        html += '<td>' + fmtBootTime(row.lastBoot) + '</td>';
        html += '<td><span class="flink" onclick="loadDeviceDetail(\'' + row.nodeId + '\', \'' + name.replace(/'/g, "\\'") + '\')">Details &rsaquo;</span></td>';
        html += '</tr>';
      });
      tbody.innerHTML = html;
    }

    parent.pluginHandler.scripttask.complianceOverview = function (message) {
      complianceOverviewData = message.event.overview || [];
      complianceOverviewData.sort(function (a, b) {
        var av = getNodeName(a.nodeId).toLowerCase(), bv = getNodeName(b.nodeId).toLowerCase();
        return av < bv ? -1 : av > bv ? 1 : 0;
      });
      renderComplianceOverview(complianceOverviewData);
    };

    function filterComplianceOverview() {
      var q = document.getElementById('cev-search').value.toLowerCase();
      var rows = document.querySelectorAll('#cev-overview-body tr');
      rows.forEach(function (r) {
        var name = (r.getAttribute('data-name') || '');
        var user = (r.getAttribute('data-user') || '');
        var desc = (r.getAttribute('data-desc') || '');
        r.style.display = (!q || name.includes(q) || user.includes(q) || desc.includes(q)) ? '' : 'none';
      });
    }

    function sortComplianceOverview(key) {
      if (complianceSortKey === key) complianceSortAsc = !complianceSortAsc;
      else { complianceSortKey = key; complianceSortAsc = true; }
      complianceOverviewData.sort(function (a, b) {
        var av, bv;
        if (key === 'user') { av = (a.lastUser || ''); bv = (b.lastUser || ''); }
        else if (key === 'desc') { av = getNodeDesc(a.nodeId); bv = getNodeDesc(b.nodeId); }
        else { av = getNodeName(a.nodeId); bv = getNodeName(b.nodeId); }
        av = av.toLowerCase(); bv = bv.toLowerCase();

        var cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return complianceSortAsc ? cmp : -cmp;
      });
      renderComplianceOverview(complianceOverviewData);
    }

    parent.pluginHandler.scripttask.deviceEvents = function (message) {
      var events = message.event.events || [];
      var ipTbl = document.getElementById('cev-ip-tbl');
      var userTbl = document.getElementById('cev-user-tbl');
      var bootTbl = document.getElementById('cev-boot-tbl');
      if (!ipTbl) return;
      var ipHtml = '', userHtml = '', bootHtml = '';
      events.forEach(function (ev) {
        if (ev.eventType === 'ipSeen') {
          var ipVal = ev.data.ip;
          var ipLnk = ipVal ? '<a href="https://iplocation.com/?ip=' + encodeURIComponent(ipVal) + '" target="_blank" rel="noopener" style="color:#0066cc;">' + ipVal + '</a>' : '-';
          ipHtml += '<tr><td>' + fmtTs(ev.timestamp) + '</td><td>' + ipLnk + '</td></tr>';
        } else if (ev.eventType === 'lastUser') {
          userHtml += '<tr><td>' + fmtTs(ev.timestamp) + '</td><td>' + (ev.data.user || '-') + '</td></tr>';
        } else if (ev.eventType === 'bootTime') {
          bootHtml += '<tr><td>' + fmtTs(ev.timestamp) + '</td><td>' + (ev.data.bootTime || '-') + '</td></tr>';
        }
      });
      ipTbl.innerHTML = ipHtml || '<tr><td colspan="2" style="color:#999;">No records</td></tr>';
      if (userTbl) userTbl.innerHTML = userHtml || '<tr><td colspan="2" style="color:#999;">No records</td></tr>';
      bootTbl.innerHTML = bootHtml || '<tr><td colspan="2" style="color:#999;">No records</td></tr>';
    };

    function loadDeviceDetail(nodeId, name) {
      document.getElementById('cev-overview').style.display = 'none';
      document.getElementById('cev-detail').style.display = 'block';
      document.getElementById('cev-detail-name').textContent = name;
      document.getElementById('cev-ip-tbl').innerHTML = '<tr><td colspan="2" style="color:#999;">Loading...</td></tr>';
      var ut = document.getElementById('cev-user-tbl');
      if (ut) ut.innerHTML = '<tr><td colspan="2" style="color:#999;">Loading...</td></tr>';
      document.getElementById('cev-boot-tbl').innerHTML = '<tr><td colspan="2" style="color:#999;">Loading...</td></tr>';
      var pt = document.getElementById('cev-power-tbl');
      if (pt) pt.innerHTML = '<tr><td colspan="2" style="color:#999;">Loading...</td></tr>';

      var pDays = 180;
      if (typeof retentionRulesCache !== 'undefined') {
        var pGlobal = retentionRulesCache.find(function (r) { return r.eventType === 'powerHistory' && r.targetType === 'global'; });
        if (pGlobal && pGlobal.days) pDays = pGlobal.days;
      }
      var pTitle = document.getElementById('cev-power-title');
      if (pTitle) pTitle.innerHTML = '&#9889; Power History (' + pDays + ' Days)';

      parent.meshserver.send({ action: 'plugin', plugin: 'scripttask', pluginaction: 'getDeviceEvents', nodeId: nodeId });
      parent.meshserver.send({ action: 'plugin', plugin: 'scripttask', pluginaction: 'getPowerHistory', nodeId: nodeId, days: pDays });
      resizeIframe();
    }

    parent.pluginHandler.scripttask.powerHistory = function (message) {
      if (!message.event || !message.event.nodeId) return;
      var nodeId = message.event.nodeId;
      var events = message.event.events || [];

      // Update detail drill-down
      var pt = document.getElementById('cev-power-tbl');
      if (pt && document.getElementById('cev-detail').style.display === 'block') {
        if (!events.length) {
          pt.innerHTML = '<tr><td colspan="2" style="color:#999;">No records up to 180 days.</td></tr>';
        } else {
          var html = '';
          events.forEach(function (ev, idx) {
            // limit to 50 to avoid massive tables
            if (idx > 50) return;
            var actionDesc = ev.msg || ev.action || "State " + ev.state;
            html += '<tr><td>' + fmtTs((ev.time && ev.time.getTime) ? ev.time.getTime() / 1000 : ev.time ? (typeof ev.time === 'string' ? Date.parse(ev.time) / 1000 : ev.time) : 0) + '</td><td>' + actionDesc + '</td></tr>';
          });
          if (events.length > 50) html += '<tr><td colspan="2" style="color:#999;font-style:italic;">...and ' + (events.length - 50) + ' more events.</td></tr>';
          pt.innerHTML = html;
        }
      }
    };

    var retentionRulesCache = [];

    parent.pluginHandler.scripttask.retentionRules = function (message) {
      retentionRulesCache = message.event.rules || [];
      // Populate default inputs
      var typeToInputId = { ipSeen: 'ret-ip-days', lastUser: 'ret-user-days', bootTime: 'ret-boot-days', powerHistory: 'ret-power-days' };
      retentionRulesCache.forEach(function (r) {
        if (r.targetType === 'global' && typeToInputId[r.eventType]) {
          var inp = document.getElementById(typeToInputId[r.eventType]);
          if (inp) inp.value = r.days;
        }
      });
      // Render scoped overrides
      var tbody = document.getElementById('cev-retention-overrides');
      if (!tbody) return;
      var overrides = retentionRulesCache.filter(function (r) { return r.targetType !== 'global'; });
      if (!overrides.length) { tbody.innerHTML = '<tr><td colspan="5" style="color:#999;">No overrides</td></tr>'; return; }
      var html = '';
      overrides.forEach(function (r) {
        html += '<tr>';
        html += '<td>' + r.eventType + '</td>';
        html += '<td>' + (r.targetType || '') + '</td>';
        html += '<td>' + (r.targetId || '') + '</td>';
        html += '<td>' + r.days + '</td>';
        html += '<td><span class="flink" style="color:#c00;" onclick="deleteRetentionRule(\'' + r._id + '\');">Remove</span></td>';
        html += '</tr>';
      });
      tbody.innerHTML = html;
    };

    function saveDefaultRetention(eventType) {
      var idMap = { ipSeen: 'ret-ip-days', lastUser: 'ret-user-days', bootTime: 'ret-boot-days', powerHistory: 'ret-power-days' };
      var days = parseInt(document.getElementById(idMap[eventType]).value, 10);
      if (isNaN(days) || days < 1) { alert('Please enter a valid number of days.'); return; }
      var existing = retentionRulesCache.find(function (r) { return r.targetType === 'global' && r.eventType === eventType; });
      var rule = existing ? Object.assign({}, existing, { days: days }) : { eventType: eventType, targetType: 'global', days: days };
      parent.meshserver.send({ action: 'plugin', plugin: 'scripttask', pluginaction: 'saveRetentionRule', rule: rule });
    }

    function deleteRetentionRule(id) {
      parent.meshserver.send({ action: 'plugin', plugin: 'scripttask', pluginaction: 'deleteRetentionRule', id: id });
    }

    function addRetentionOverride() {
      var tbody = document.getElementById('cev-retention-overrides');
      var row = document.createElement('tr');
      row.innerHTML = '<td><select class="ort-type"><option value="ipSeen">IP Seen</option><option value="lastUser">Last User</option><option value="bootTime">Boot Time</option><option value="powerHistory">Power History</option></select></td>' +
        '<td><select class="ort-scope"><option value="node">Node</option><option value="mesh">Mesh</option><option value="tag">Tag</option></select></td>' +
        '<td><input type="text" class="ort-target" style="width:120px;" placeholder="ID or name"></td>' +
        '<td><input type="number" class="ort-days" min="1" value="90" style="width:60px;"></td>' +
        '<td><button style="background:#007bff;color:#fff;" onclick="saveNewOverride(this);">Save</button></td>';
      tbody.appendChild(row);
    }

    function saveNewOverride(btn) {
      var row = btn.closest('tr');
      var eventType = row.querySelector('.ort-type').value;
      var targetType = row.querySelector('.ort-scope').value;
      var targetId = row.querySelector('.ort-target').value.trim();
      var days = parseInt(row.querySelector('.ort-days').value, 10);
      if (!targetId) { alert('Please enter a target ID or name.'); return; }
      if (isNaN(days) || days < 1) { alert('Please enter a valid number of days.'); return; }
      parent.meshserver.send({ action: 'plugin', plugin: 'scripttask', pluginaction: 'saveRetentionRule', rule: { eventType: eventType, targetType: targetType, targetId: targetId, days: days } });
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
    function prepHistory(nh) {
      var
        nowTime = Math.floor(new Date() / 1000); var d = new Date(0); d.setUTCSeconds(nh.latestTime);
      nh.timeStr = d.toLocaleString(); if (nh.errorVal != null) { nh.returnTxt = nh.errorVal; } else {
        nh.returnTxt = nh.returnVal;
      } nh.statusTxt = 'Queued'; if (nh.dispatchTime != null)
        nh.statusTxt = 'Running'; if (nh.errorVal != null) nh.statusTxt = 'Error'; if (nh.returnVal != null)
        nh.statusTxt = 'Completed'; if (nh.dontQueueUntil > nowTime) nh.statusTxt = 'Scheduled';
      if (nh.returnTxt == null) nh.returnTxt = '&nbsp;';
      if (nh.statusTxt == 'Completed') {
        nh.statusTxt = '<span title="Completed ' + secondsToHms((nh.completeTime - nh.dispatchTime)) + '">' +
          nh.statusTxt + '</span>';
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
      // Fetch policies to map names? They are not cached in user.handlebars, maybe just request them or
      // rely on ID for now if policies aren't loaded.
      // Actually, we can fetch policies globally, but for now we just show IDs or have the backend send
      // enriched data.
      // Let's modify later, for now just show basic state.

      var compTbl = document.getElementById('compTbl');
      var rows = compTbl.querySelectorAll('.stCRow');
      if (rows.length) rows.forEach(function (r) { r.parentNode.removeChild(r); });

      if (state.length) {
        state.forEach(function (s) {
          let tpl = `< td> ${s.policyName || s.policyId}</td>
                    <td><b>${s.state}</b></td>
                    <td>${s.lastRunTime ? new Date(s.lastRunTime * 1000).toLocaleString() : 'Never'}</td>
                    <td>
                      <pre style="max-height:100px;overflow:auto;margin:0;">${s.lastOutput || ''}</pre>
                    </td>`;
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
        let actionHtml = `<span class="flink" onclick="editVar(this);">Edit</span> <span class="flink"
          onclick = "delVar(this);" > Delete</span > `;
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
      nh.actionTxt = '<span class="delSched" onclick="deleteSchedule(this);">Delete</span>'; return nh;
    }
    function secondsToHms(d) {
      d = Number(d); if (d == 0) return "immediately"; var h = Math.floor(d /
        3600); var m = Math.floor(d % 3600 / 60); var s = Math.floor(d % 3600 % 60); var hDisplay = h > 0 ? h +
          (h == 1 ? " hour, " : " hours, ") : "";
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
      parent.meshserver.send({
        action: 'plugin', plugin: 'scripttask', pluginaction: 'newVar', name:
          name, scope: scope, scopeTarget: scopeTarget, value: value, currentNodeId: parent.currentNode._id
      });

    }
    function newVar() {
      parent.setDialogMode(2, "New Variable", 3, newVarEx, `Variable Name: <input type="text" id=stvarname /><br />Scope: <select id=stvarscope><option value="global">Global</option><option value="script">Script</option><option value="mesh">Mesh</option><option value="node">Node</option></select><br />Value: <input id="stvarvalue" type="text" />`);
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
      parent.meshserver.send({
        action: 'plugin', plugin: 'scripttask', pluginaction: 'editVar', id:
          varid, name: name, scope: scope, scopeTarget: scopeTarget, value: value, currentNodeId:
          parent.currentNode._id
      });
    }
    function editVar(el) {
      var vid = el.parentNode.parentNode.getAttribute('x-data-id');
      var v = variables.filter(obj => { return obj._id === vid })[0];
      var soptHtml = '';
      for (const [k, t] of Object.entries(varScopes)) {
        soptHtml += '<option value="' + k + '"';
        if (v.scope == k) soptHtml += ' selected'; soptHtml += '>' + t + '</option>';
      }
      parent.setDialogMode(2, "Edit Variable", 3,
        editVarEx, 'Variable Name: <input type="text" id=stvarname value="' + v.name
        + '" /><br />Scope: <select id=stvarscope>' + soptHtml
        + '</select><br />Value: <input id="stvarvalue" type="text" value="' + v.value
        + '" /><input type="hidden" id="stvarid" value="' + vid + '" />');
      parent.focusTextBox('stvarname');
    } function delVarEx() {
      var
        varid = parent.document.getElementById('stvarid').value; parent.meshserver.send({
          action: 'plugin'
          , plugin: 'scripttask', pluginaction: 'deleteVar', id: varid, currentNodeId:
            parent.currentNode._id
        });
    } function delVar(el) {
      var
        vid = el.parentNode.parentNode.getAttribute('x-data-id'); var v = variables.filter(obj => {
          return
          obj._id === vid
        })[0];
      parent.setDialogMode(2, "Delete Variable", 3, delVarEx, `Are you sure you want to delete
                        this ?<input type="hidden" id="stvarid" value="` + vid + `" /><br />Name: ` + v.name +
        `<br />Scope: ` + varScopes[v.scope] + `<br />Value: ` + v.value);
    }
    function renameEx() {
      var name = parent.document.getElementById('stfilename').value;
      var id = parent.document.getElementById('stid').value;
      parent.meshserver.send({
        action: 'plugin', plugin: 'scripttask', pluginaction: 'rename', name:
          name, id: id, currentNodeId: parent.currentNode._id
      });
    }
    function goRename() {
      var scriptEl = document.querySelectorAll('.liselected');
      if (scriptEl.length != 1) return;
      var el = scriptEl[0];
      var name = el.querySelector('.fname').innerHTML;
      var id = el.getAttribute('x-data-id');
      parent.setDialogMode(2, "Rename " + name, 3, renameEx, `<input type="text" value="` + name + `"
            style = "width:100%" id = "stfilename" /> <input type="hidden" id="stid" value="` + id + `" />`);
      parent.focusTextBox('stfilename');
    }
    function newEx() {
      var name = parent.document.getElementById('stfilename').value;
      var parent_id = parent.document.getElementById('stfolderid').value;
      var fileType = parent.document.getElementById('stfiletype').value;
      parent.meshserver.send({
        action: 'plugin', plugin: 'scripttask', pluginaction: 'new', name:
          name, parent_id: parent_id, filetype: fileType, currentNodeId: parent.currentNode._id
      });
    }
    function goNew() {
      var scriptEl = document.querySelectorAll('.liselected');
      var folder_id = null;
      if (scriptEl.length > 0) {
        var el = scriptEl[0];
        folder_id = el.getAttribute('x-data-folder');
      }
      parent.setDialogMode(2, "New Script", 3, newEx, `Name: <input type="text" value="` + name + `"
                          id = stfilename style = width: 100 % /><br / > Type:<select id="stfiletype">
                          <option value="bash">Bash</option>
                          <option value="bat">BAT</option>
                          <option value="ps1">PS1</option>
                        </select><input type="hidden" id="stfolderid" value="` + folder_id + `" />`);
      parent.focusTextBox('stfilename');
    }
    function newFolderEx() {
      var name = parent.document.getElementById('stfoldername').value;
      var parent_id = parent.document.getElementById('stfolderid').value;
      parent.meshserver.send({
        action: 'plugin', plugin: 'scripttask', pluginaction: 'newFolder',
        name: name, parent_id: parent_id
      });
    }
    function goNewFolder() {
      var scriptEl = document.querySelectorAll('.liselected');
      var folder_id = null;
      if (scriptEl.length > 0) {
        var el = scriptEl[0];
        folder_id = el.getAttribute('x-data-folder');
      }
      parent.setDialogMode(2, "New Folder", 3, newFolderEx, `<input type="text" value=""
                          id = stfoldername style = width: 100 % /><input type="hidden" id="stfolderid"
                          value = "${folder_id}" /> `);
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
        parent.meshserver.send({
          action: 'plugin', plugin: 'scripttask', pluginaction:
            'loadScriptHistory', scriptId: xdi
        });
      }
      parseVariables();
    }
    function deleteEx() {
      var id = parent.document.getElementById('stdelid').value;
      parent.meshserver.send({
        action: 'plugin', plugin: 'scripttask', pluginaction: 'delete', id: id
      });
    }
    function goDelete() {
      var els = document.querySelectorAll('.liselected');
      if (els.length == 0) return;
      var el = els[0];
      var name = el.innerHTML;
      var id = el.getAttribute('x-data-id');
      parent.setDialogMode(2, "Delete " + name, 3, deleteEx, `Are you sure? <input type="hidden"
                          id = "stdelid" value = "${id}" /> `);
    }
    function deleteScheduleEx() {
      var id = parent.document.getElementById('stdelid').value;
      parent.meshserver.send({
        action: 'plugin', plugin: 'scripttask', pluginaction: 'delete', id: id
      });
    }
    function deleteSchedule(el) {
      var id = el.parentNode.parentNode.getAttribute('x-data-id');
      parent.setDialogMode(2, "Delete Schedule", 3, deleteScheduleEx, `Are you sure you want to delete
                        this schedule ? <input type="hidden" id="stdelid" value="${id}" />`);
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
      if (!elementDragged) { // Test that the item being dragged is a valid one
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
      parent.meshserver.send({
        action: 'plugin', plugin: 'scripttask', pluginaction: 'move', id:
          move_id, to: container_id
      });
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

  