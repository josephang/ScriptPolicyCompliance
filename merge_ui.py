import re

with open('views/user.handlebars', 'r') as f:
    user_hbs = f.read()

with open('views/policy.handlebars', 'r') as f:
    pol_hbs = f.read()

with open('views/smtp.handlebars', 'r') as f:
    smtp_hbs = f.read()

# 1. Add "Scripts" to controlBar
user_hbs = user_hbs.replace(
    '<span onclick="goRun();">Run</span>',
    '<span onclick="goRun();">Run</span>\n      <span onclick="goScripts();">Scripts</span>'
)

# 2. Extract policy CSS
pol_css_match = re.search(r'<style>(.*?)</style>', pol_hbs, re.DOTALL)
pol_css = pol_css_match.group(1) if pol_css_match else ""
# Change body styling to target the container
pol_css = pol_css.replace('body {', '#policy_endpoints {')

# 3. Extract policy HTML
pol_html_match = re.search(r'<div class="main-container">(.*?)</div>\s*<script', pol_hbs, re.DOTALL)
pol_html = pol_html_match.group(1) if pol_html_match else ""

# 4. Extract policy JS
pol_js_match = re.search(r'<script type="text/javascript">(.*?)</script>\s*</body>', pol_hbs, re.DOTALL)
pol_js = pol_js_match.group(1) if pol_js_match else ""

# Fix policy JS
pol_js = pol_js.replace('doOnLoad()', 'doOnLoadPolicy()')
pol_js = pol_js.replace('window.opener.parent.', 'parent.')
pol_js = pol_js.replace('window.opener.', '') # for scriptTree
pol_js = pol_js.replace('window.loadPolicyData =', 'function loadPolicyData')

# 5. Extract smtp HTML
smtp_html_match = re.search(r'<div id="smtpPanel".*?>(.*?)</div>\s*<script>', smtp_hbs, re.DOTALL)
smtp_html = smtp_html_match.group(0) if smtp_html_match else ""

# 6. Extract smtp JS
smtp_js_match = re.search(r'<script>(.*?)</script>', smtp_hbs, re.DOTALL)
smtp_js = smtp_js_match.group(1) if smtp_js_match else ""
smtp_js = smtp_js.replace('window.opener.parent.', 'parent.')
smtp_js = smtp_js.replace('window.close()', 'goScripts()')

# remove window.onload from smtp_js
smtp_js = re.sub(r'// Request initial config.*?};', '', smtp_js, flags=re.DOTALL)

# 7. Merge them back into user_hbs
# find end of scripts_endpoints
end_index = user_hbs.find('</div>\n  </div>\n</body>')

if end_index != -1:
    new_html = f"""
    <div id="policy_endpoints" style="display:none; background-color:#036; color:white; padding:20px; min-height:100%; overflow:auto;">
        <style>{pol_css}</style>
        <div class="main-container">
        {pol_html}
        </div>
    </div>
    
    <div id="smtp_endpoints" style="display:none; background-color:#fff; min-height:100%; overflow:auto;">
        {smtp_html}
    </div>
"""
    user_hbs = user_hbs[:end_index] + new_html + user_hbs[end_index:]
else:
    print("Could not find insertion point!")

# 8. Add JS functions
js_injection = f"""
  {pol_js}
  
  {smtp_js}
  
  function goScripts() {{
    document.getElementById('policy_endpoints').style.display = 'none';
    document.getElementById('smtp_endpoints').style.display = 'none';
    document.getElementById('scripts_endpoints').style.display = 'block';
  }}
"""
user_hbs = user_hbs.replace('<script type="text/javascript">', '<script type="text/javascript">\n' + js_injection)

# 9. Modify goPolicy and goSmtp
user_hbs = re.sub(
    r'function goPolicy\(\) \{[\s\S]*?\}',
    r'''function goPolicy() {
    document.getElementById('scripts_endpoints').style.display = 'none';
    document.getElementById('smtp_endpoints').style.display = 'none';
    document.getElementById('policy_endpoints').style.display = 'block';
    doOnLoadPolicy();
  }''', user_hbs
)

user_hbs = re.sub(
    r'function goSmtp\(\) \{[\s\S]*?\}',
    r'''function goSmtp() {
    document.getElementById('scripts_endpoints').style.display = 'none';
    document.getElementById('policy_endpoints').style.display = 'none';
    document.getElementById('smtp_endpoints').style.display = 'block';
    parent.meshserver.send({ action: 'plugin', plugin: 'scripttask', pluginaction: 'getSmtpConfig' });
  }''', user_hbs
)

# 10. Update websocket listeners
old_policy_listener = r'parent\.pluginHandler\.scripttask\.policyData = function \(message\) \{[\s\S]*?\}'
new_policy_listener = '''parent.pluginHandler.scripttask.policyData = function (message) {
    loadPolicyData(message.event.policies, message.event.assignments, message.event.error);
  }'''
user_hbs = re.sub(old_policy_listener, new_policy_listener, user_hbs)

old_smtp_listener = r'parent\.pluginHandler\.scripttask\.smtpData = function \(message\) \{[\s\S]*?\}'
new_smtp_listener = '''parent.pluginHandler.scripttask.smtpData = function (message) {
    loadSmtpData(message.event.config, message.event.error);
  }'''
user_hbs = re.sub(old_smtp_listener, new_smtp_listener, user_hbs)

with open('views/user.handlebars', 'w') as f:
    f.write(user_hbs)
print("Merge complete!")
