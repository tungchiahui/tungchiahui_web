### 6.6.2 语音控制机器人实现

#### 1.语音控制核心实现

功能包voice\_case的src目录下，新建C++文件voice\_control.cpp，并编辑文件，输入如下内容：

```cpp
#include <string>
#include "rclcpp/rclcpp.hpp"
#include "std_msgs/msg/string.hpp"
#include "geometry_msgs/msg/twist.hpp"

using std::placeholders::_1;
using namespace std;
using namespace std::chrono_literals;

class VoiceControl : public rclcpp::Node
{
public:
    VoiceControl() : Node("voice_control_node"),lin_vel(0.0),ang_vel(0.0)
    {
        RCLCPP_INFO(this->get_logger(), "语音控制节点创建！");
        // 订阅方：用于监听语音识别模块发布的消息
        sub_ = this->create_subscription<std_msgs::msg::String>("voicewords", 10, std::bind(&VoiceControl::callback, this, _1));
        // 发布方：用于发布需要被合成语音的文本
        pub_ = this->create_publisher<std_msgs::msg::String>("ttswords", 10);
        // 发布方：用于向机器人发布速度指令
        cmd_vel_pub_ = this->create_publisher<geometry_msgs::msg::Twist>("cmd_vel", 10);
        // 定时器
        timer_ = this->create_wall_timer(100ms,std::bind(&VoiceControl::cmd_vel_pub,this));
    }

private:
    rclcpp::TimerBase::SharedPtr timer_;
    double lin_vel, ang_vel;
    void cmd_vel_pub()
    {
        geometry_msgs::msg::Twist twist;
        twist.linear.x = lin_vel;
        twist.angular.z = ang_vel;
        cmd_vel_pub_->publish(twist);
    }
    void callback(const std_msgs::msg::String &msg)
    {
        // 处理订阅到的文本，并作出相应处理
        string dataString = msg.data;
        std_msgs::msg::String pubString;
        if (dataString.find("前进") != std::string::npos)
        {
            pubString.data = "开始前进";
            lin_vel = 0.3;
            ang_vel = 0.0;
        }
        else if (dataString.find("后退") != std::string::npos)
        {
            pubString.data = "开始后退";
            lin_vel = -0.3;
            ang_vel = 0.0;
        }
        else if (dataString.find("左转") != std::string::npos)
        {
            pubString.data = "开始左转";
            ang_vel = 0.5;
        }
        else if (dataString.find("右转") != std::string::npos)
        {
            pubString.data = "开始右转";
            ang_vel = -0.5;
        }
        else if (dataString.find("停止") != std::string::npos)
        {
            pubString.data = "停止";
            lin_vel = 0.0;
            ang_vel = 0.0;
        }
        else
        {
            pubString.data = msg.data;
        }
        cout << pubString.data << endl;
        pub_->publish(pubString);
    }
    rclcpp::Subscription<std_msgs::msg::String>::SharedPtr sub_;
    rclcpp::Publisher<std_msgs::msg::String>::SharedPtr pub_;
    rclcpp::Publisher<geometry_msgs::msg::Twist>::SharedPtr cmd_vel_pub_;
};

int main(int argc, char *argv[])
{
    rclcpp::init(argc, argv);
    rclcpp::spin(std::make_shared<VoiceControl>());
    rclcpp::shutdown();
    return 0;
}
```

#### 2.编辑配置文件

CMakeLists.txt 中需要添加的配置如下：

```Cmake
add_executable(voice_control src/voice_control.cpp)
target_include_directories(voice_control PUBLIC
  $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
  $<INSTALL_INTERFACE:include>)
ament_target_dependencies(
  voice_control
  "rclcpp"
  "std_msgs"
  "geometry_msgs"
)

install(TARGETS voice_control
  DESTINATION lib/${PROJECT_NAME})
```

#### 3.编译

终端中进入当前工作空间，编译功能包：

```
colcon build --packages-select voice_case
```

#### 4.执行

首先请启动仿真环境，指令如下：

```
. install/setup.bash
ros2 launch stage_ros2 my_house.launch.py
```

当前工作空间下，启动终端，并输入如下指令：

```
. install/setup.bash
ros2 run voice_case voice_control
```

再新建一个终端，启动语音合成节点：

```
. install/setup.bash
ros2 run ros2_xf_bridge t2v
```

再新建一个终端，启动语音识别节点：

```
. install/setup.bash
ros2 run ros2_xf_bridge v2t
```

在语音识别终端中，录入语音指令，就可以控制机器人运动了。

